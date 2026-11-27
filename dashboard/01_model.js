'use strict';
(() => {
const L = Math.log, E = Math.exp, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sig = (z) => 1 / (1 + E(-clamp(z, -20, 20)));
const r2 = (n) => Math.round(n * 100) / 100, r3 = (n) => Math.round(n * 1000) / 1000;
const r4 = (n) => Math.round(n * 1e4) / 1e4, cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const fFee = (v) => (v === 0 ? 'free' : `$${v.toFixed(2)}`), arrN = (n, fn) => Array.from({ length: n }, fn);
const EXCL = new Set('Bridge,Canonical Bridge,Liquid Staking,Liquid Restaking,Restaked BTC,CEX'.split(','));
const VER_RE = /\s(v\d+(\.\d+)?|\d+\.\d+)$/i, WRAP_RE = /\b(wrapped|staked|staking)\b/i;
const CEX_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

function ledgerOf(p, fl) {
  if (!(p.mcap_usd === null && p.gecko_id === null && p.symbol === null)) {
    return { bucket: p.mcap_usd > 0 ? 'live_comp' : 'tokenized', eligible: false };
  }
  const c = p.category || '';
  if (EXCL.has(c) || VER_RE.test(p.name) || WRAP_RE.test(p.name) || CEX_RE.test(p.name)) {
    return { bucket: 'set_aside', eligible: false };
  }
  return { bucket: p.tvl_usd >= (fl || 50e6) ? 'extended_or_watchlist' : 'early', eligible: true };
}

function median(vals) {
  if (!vals.length) return 0;
  const s = vals.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function solveLinearSystem(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    if (p !== i) [M[i], M[p]] = [M[p], M[i]];
    const pv = Math.abs(M[i][i]) < 1e-12 ? 1e-12 : M[i][i];
    for (let j = i; j <= n; j++) M[i][j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i];
      for (let j = i + 1; j <= n; j++) M[r][j] -= f * M[i][j];
    }
  }
  return M.map((r) => r[n]);
}

function fitStage1Huber(comps, refTvl, k) {
  const ref = refTvl || 100e6, rk = k || 0;
  const lt = comps.map((c) => L(c.tvl_usd / ref)), lm = comps.map((c) => L(c.mcap_usd / ref));
  const w = new Array(comps.length).fill(1); let c = [0, 0];
  for (let it = 0; it < 25; it++) {
    const M = [[0, 0], [0, 1e-4]], rhs = [0, 0];
    for (let i = 0; i < comps.length; i++) {
      const wi = w[i], x = lt[i];
      rhs[0] += wi * lm[i]; rhs[1] += wi * x * lm[i];
      M[0][0] += wi; M[0][1] += wi * x; M[1][0] += wi * x; M[1][1] += wi * x * x;
    }
    c = solveLinearSystem(M, rhs);
    for (let i = 0; i < comps.length; i++) {
      const e = Math.abs(lm[i] - (c[0] + c[1] * lt[i]));
      w[i] = e <= 1.35 ? 1 : 1.35 / e;
    }
  }
  const cat_adj = {};
  if (rk > 0) {
    const byC = new Map();
    comps.forEach((p, i) => {
      const cat = p.category || 'Uncategorized', ls = byC.get(cat) || [];
      ls.push(lm[i] - (c[0] + c[1] * lt[i])); byC.set(cat, ls);
    });
    for (const [cat, res] of [...byC.entries()].sort((a, b) => cmp(a[0], b[0]))) {
      cat_adj[cat] = r4(res.reduce((a, v) => a + v, 0) / (res.length + rk));
    }
  }
  return { ref_tvl_usd: ref, intercept: r4(c[0]), beta_tvl: r4(c[1]), cat_adj };
}

function valueLadder(comps, wfCut) {
  const d = comps.filter((c) => c.listed_at).sort((a, b) => cmp(a.listed_at, b.listed_at));
  const cut = wfCut || (d[d.length >> 1] || {}).listed_at || '2024-07-15';
  const trn = comps.filter((c) => !c.listed_at || c.listed_at < cut);
  const tst = comps.filter((c) => c.listed_at && c.listed_at >= cut);
  const ev = (m) => {
    const pred = (tr, tg) => {
      if (m === 'flat') return Math.max(1, tg.tvl_usd * E(median(tr.map((c) => L(c.mcap_usd / c.tvl_usd)))));
      const f = fitStage1Huber(tr, 100e6, m === 'ridge' ? 64 : 0);
      const adj = m === 'ridge' ? (f.cat_adj[tg.category || 'Uncategorized'] || 0) : 0;
      return Math.max(1, E(L(f.ref_tvl_usd) + f.intercept + f.beta_tvl * L(tg.tvl_usd / f.ref_tvl_usd) + adj));
    };
    const loo = comps.map((c, i) => Math.abs(L(c.mcap_usd / pred(comps.filter((_, j) => j !== i), c))));
    const wf = tst.map((c) => Math.abs(L(c.mcap_usd / pred(trn, c))));
    return { loo_miss: r3(E(median(loo))), wf_miss: r3(E(median(wf))) };
  };
  return { flat: ev('flat'), curve: ev('curve'), ridge: ev('ridge') };
}

function peerFeats(p, om, cl) {
  const ay = p.age_days == null ? om.median_age_years : p.age_days / 365;
  const g = p.change_7d == null ? om.global_med_7d : p.change_7d;
  return [1, L(1 + ay), p.age_days == null ? 1 : 0, cl[p.category || 'Uncategorized'] || 0,
    L(p.tvl_usd / 50e6), Math.tanh((g - om.global_med_7d) / 35)];
}

function fitOddsModel(peers, om) {
  const baseR = clamp(peers.filter((p) => p.y === 1).length / Math.max(1, peers.length), 0.05, 0.95);
  const k = om.cat_share_k || 6, counts = new Map();
  for (const p of peers) {
    const key = p.category || 'Uncategorized', cur = counts.get(key) || { n: 0, y: 0 };
    cur.n++; cur.y += p.y; counts.set(key, cur);
  }
  const clMap = {}, baseLogit = L(baseR / (1 - baseR));
  for (const [cat, s] of [...counts.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    const pr = clamp((s.y + k * baseR) / (s.n + k), 0.05, 0.95);
    clMap[cat] = r4(L(pr / (1 - pr)) - baseLogit);
  }
  const X = peers.map((p) => peerFeats(p, om, clMap)), dim = X[0].length, c = new Array(dim).fill(0);
  for (let it = 0; it < 20; it++) {
    const H = arrN(dim, (_, i) => arrN(dim, (_, j) => (i === j && i > 0 ? 1.5 : 0))), gr = new Array(dim).fill(0);
    for (let i = 0; i < peers.length; i++) {
      const xi = X[i]; let z = 0;
      for (let j = 0; j < dim; j++) z += c[j] * xi[j];
      const pr = sig(z), wt = Math.max(1e-6, pr * (1 - pr)), err = peers[i].y - pr;
      for (let j = 0; j < dim; j++) {
        gr[j] += err * xi[j];
        for (let m = 0; m < dim; m++) H[j][m] += wt * xi[j] * xi[m];
      }
    }
    for (let j = 1; j < dim; j++) gr[j] -= 1.5 * c[j];
    const step = solveLinearSystem(H, gr);
    for (let j = 0; j < dim; j++) c[j] += step[j];
  }
  return { coef: c, catLogitMap: clMap };
}

function fitStage2Logistic(peers, om) {
  const { coef: c, catLogitMap: cat_logit } = fitOddsModel(peers, om);
  return { intercept: r4(c[0]), beta_age: r4(c[1]), beta_legacy: r4(c[2]),
    beta_cat_share: r4(c[3]), cat_logit, beta_tvl: r4(c[4]), beta_g7d: r4(c[5]) };
}

function oddsLadder(peers, om) {
  const d = peers.filter((p) => p.listed_at).sort((a, b) => cmp(a.listed_at, b.listed_at));
  const cut = om.wf_cutoff || (d[Math.floor(d.length * 0.55)] || {}).listed_at || '2025-06-04';
  const sumB = (fit, list) => list.reduce((acc, p) => {
    const f = peerFeats(p, om, fit.catLogitMap); let z = 0;
    for (let j = 0; j < f.length; j++) z += fit.coef[j] * f[j];
    return acc + (p.y - sig(z)) ** 2;
  }, 0);
  let cv = 0;
  for (let f = 0; f < 10; f++) {
    cv += sumB(fitOddsModel(peers.filter((_, i) => i % 10 !== f), om), peers.filter((_, i) => i % 10 === f));
  }
  const tr = peers.filter((p) => !p.listed_at || p.listed_at < cut);
  const ts = peers.filter((p) => p.listed_at && p.listed_at >= cut);
  return { cv10_brier: r3(cv / peers.length), wf_brier: r3(sumB(fitOddsModel(tr, om), ts) / ts.length) };
}

function impliedValue(r, pF, oF, cal) {
  const pm = cal.price_model, om = cal.odds_model, cat = r.category || 'Uncategorized';
  const catAdj = Object.hasOwn(pF.cat_adj, cat) ? pF.cat_adj[cat] : 0;
  const baseMult = E(pF.intercept), catMult = E(catAdj), sizeMult = E(pF.beta_tvl * L(r.tvl_usd / pF.ref_tvl_usd));
  const valueIfLaunched = Math.max(1, Math.round(pF.ref_tvl_usd * baseMult * sizeMult * catMult));
  const ay = r.age_days == null ? om.median_age_years : r.age_days / 365, leg = r.age_days == null ? 1 : 0;
  const catLogit = (oF.cat_logit && oF.cat_logit[cat]) || 0;
  const g7d = r.change_7d == null ? om.global_med_7d : r.change_7d;
  const st = oF.intercept + oF.beta_cat_share * catLogit + oF.beta_tvl * L(r.tvl_usd / 50e6);
  const g7 = oF.beta_g7d * Math.tanh((g7d - om.global_med_7d) / 35);
  const pMax = sig(st + oF.beta_age * L(1 + om.max_age_years));
  const pNow = sig(st + oF.beta_age * L(1 + ay) + oF.beta_legacy * leg + g7);
  const cond = clamp(Math.max(0.05, pMax - pNow) / Math.max(0.05, 1 - pNow), 0.15, 0.92);
  const launchOdds = r4(r.sibling_symbol != null ? Math.max(0.10, cond * 0.50) : cond);
  const implied = Math.max(1, Math.round(valueIfLaunched * launchOdds));
  const sc = (pm.sector_conformal_scales && pm.sector_conformal_scales[r.sector]) || 1;
  const low = Math.max(1, Math.round(implied * E(pm.zq25 * sc))), high = Math.max(implied, Math.round(implied * E(pm.zq75 * sc)));
  const p10 = Math.max(1, Math.round(implied * E(pm.zq10 * sc))), p90 = Math.max(high, Math.round(implied * E(pm.zq90 * sc)));
  return { valueIfLaunched, launchOdds, implied, baseMult, sizeMult, catMult, catAdj, catLogit, pNow, pMax, sc,
    low, high, p10, p90 };
}

function calcMinTicketUsd(imp, ds, tvl, tf, cRate) {
  const V = imp * ds;
  if (!(V > tf && V > 0 && tvl > 0)) return null;
  let dMin;
  if (cRate <= 0) dMin = tf === 0 ? 100 : (tf * tvl) / (V - tf);
  else {
    const b = cRate * tvl + tf - V;
    if (b >= 0) return null;
    const disc = b * b - 4 * cRate * tf * tvl;
    if (disc <= 0) return null;
    dMin = (-b - Math.sqrt(disc)) / (2 * cRate);
  }
  const cand = Math.max(100, Math.ceil(dMin / 100) * 100);
  return (V * cand) / (tvl + cand) - tf - cRate * cand > 0 ? cand : null;
}

const FAMS = {
  evm_l2: [1.15, .08, .25, 1e3, 45, 5, 'EVM wallet', '{c} gas', '$0.08-$0.30/tx',
    'bi-weekly rebalance', 'repay debt & revoke ERC-20', '2-15m'],
  eth_l1: [18, 0, 12, 5e3, 50, 3, 'EVM/HW wallet', 'ETH', '$12-$18 L1',
    'deposit-and-hold', 'withdraw & revoke ERC-20', '12s L1'],
  solana: [.55, .02, .05, 1e3, 45, 5, 'Phantom/Backpack', 'SOL', '<$0.05/tx',
    'bi-weekly rebalance', 'close SPL accounts', '1-2s'],
  bitcoin: [5.5, 0, 5.5, 2500, 55, 4, 'BTC/LN wallet', 'BTC', '$5.50 L1',
    'hold LN channel', 'close LN channel', '10-60m'],
  btc_l2: [3.5, .35, 2, 2e3, 50, 5, '{c} BTC wallet', '{bg}', '$0.35-$3.50',
    'epoch hold', '7-21d unbond cooldown', '10-60m'],
  bittensor: [.25, .05, .15, 1500, 50, 4, 'Bittensor wallet', 'TAO', '<$0.10/tx',
    'subnet yield check', 'unstake dTAO', '12s'],
  algorand: [.25, .01, .05, 1e3, 45, 4, 'Pera/Defly wallet', 'ALGO', '<$0.02/tx',
    'bi-weekly check-in', 'opt out unused ASAs', '3.3s'],
  cosmos_ibc: [.4, .03, .15, 1e3, 45, 4, 'Keplr/Leap wallet', 'IBC gas', '<$0.05/tx',
    'bi-weekly check-in', 'canonical IBC exit', '6s'],
  xrpl_stellar: [.35, .02, .1, 1500, 45, 4, '{xw} wallet', '{xg}', '<$0.02/tx',
    'epoch hold', 'remove trustlines', '4-5s'],
  alt_vm: [.8, .06, .25, 1e3, 45, 5, '{c}-native wallet', '{c} gas', '$0.06-$0.80',
    'bi-weekly check-in', 'clear permissions', '<5s'],
};

function coreActionFor(row, ch, fam, dep) {
  const cat = (row.category || '').toLowerCase(), d = dep.toLocaleString('en-US'), n = row.name;
  if (fam === 'bitcoin') return `Open BTC Lightning channel with ${n} ($${d} BTC).`;
  if (fam === 'bittensor') return `Stake $${d} TAO into ${/dtao/i.test(n) ? `${n} subnet` : `${n} dTAO subnet`}.`;
  if (fam === 'algorand') return cat.includes('rwa') ? `KYC & hold $${d} RWA ASAs on ${n}.` : `Opt in & supply $${d} ALGO (${n}).`;
  if (fam === 'cosmos_ibc') return `Transfer $${d} via IBC to ${ch} and supply ${n}.`;
  if (fam === 'xrpl_stellar') return `Trustline + $${d} ${ch === 'Ripple' ? 'XRP' : 'XLM'} on ${n}.`;
  if (cat.includes('insurance')) return `Supply $${d} to ${n} underwriting pool (${ch}).`;
  if (/curator|allocator|aggregator|cdp manager|indexes/.test(cat)) return `Deposit $${d} in ${n} vault (${ch}); check fees.`;
  if (/lend|cdp|collateral/.test(cat)) return `Supply $${d} collateral to ${n} (${ch}); <35% LTV.`;
  if (/dex|liquidity manager/.test(cat)) return `Provide $${d} major LP on ${n} (${ch}); avoid tight IL.`;
  if (/derivative|prediction|option|otc|synthetic/.test(cat)) return `Post $${d} hedged margin on ${n} (${ch}).`;
  if (/basis|yield|farm|governance|^dor$/.test(cat)) return `Stake $${d} ${n} receipt on ${ch} across epochs.`;
  if (/rwa|cedefi|crypto card|payments/.test(cat)) return `Pass issuer KYC, then hold $${d} in ${n} (${ch}).`;
  return `Deposit $${d} native ${ch} assets into ${n} pool.`;
}

function farmPlan(row, cal, depO, drO, wkO, caO) {
  const b = row.farm_econ || {}, ch = b.best_chain || (row.chains && row.chains[0]) || 'Ethereum';
  const fam = b.chain_family || 'evm_l2', imp = row.implied_value_usd, tvl = row.tvl_usd;
  const [sfR, wfW, efR, minFl, baseM, wkM, walT, gasT, gasTier, cad, cln, stl] = FAMS[fam] || FAMS.evm_l2;
  const sub = (s) => s.replace(/\{c\}/g, ch).replace(/\{bg\}/g, ch === 'Stacks' ? 'STX' : ch === 'CORE' ? 'CORE' : 'BTC')
    .replace(/\{xw\}/g, ch === 'Ripple' ? 'Xaman' : 'Freighter').replace(/\{xg\}/g, ch === 'Ripple' ? 'XRP' : 'XLM');
  const ds = drO == null ? cal.default_drop_share : drO, wk = wkO == null ? cal.default_horizon_weeks : wkO;
  const cApr = caO == null ? cal.tbill_apr : caO;
  const defDep = b.deposit_usd || Math.min(25e3, Math.max(minFl, Math.round((tvl * 2e-4) / 500) * 500));
  const dep = depO && depO > 0 ? depO : defDep;
  const sf = r2(sfR), wf = r2(wfW * wk), ef = r2(efR), tf = r2(sf + wf + ef), wm = wkM * wk, tm = baseM + wm, th = r2(tm / 60);
  const dil = dep / (tvl + dep), cRate = cApr * (wk / 52), dropUsd = r2(imp * ds * dil);
  const netUsd = r2(dropUsd - tf), carryUsd = r2(dep * cRate), carry4 = r2(dep * 0.04 * (wk / 52));
  const netHr = r2(netUsd / Math.max(0.25, th)), exUsd = r2(netUsd - carryUsd), exHr = r2(exUsd / Math.max(0.25, th));
  const minT = calcMinTicketUsd(imp, ds, tvl, tf, cRate);
  const verdict = exUsd > 0 && exHr >= cal.farm_hourly_hurdle ? 'FARM' : exUsd > 0 ? 'MARGINAL' : 'SKIP';
  const den = imp * dil, beDrop = den > 0 ? r2((tf / den) * 1e4) / 1e4 : 1;
  const beOdds = imp > 0 && row.launch_odds > 0 ? r3(Math.min(1, tf / ((imp / row.launch_odds) * ds * dil))) : 1;
  const p05 = Math.abs(cal.snapshot_7d_p05), exitTvl = Math.round(tvl * (1 - clamp(p05 / 100, 0.12, 0.25)));
  const dropIf = r2((row.value_if_launched_usd || imp) * ds * dil);
  const dF = dep.toLocaleString('en-US'), cm = Math.max(5, baseM - 35), cL = (row.category || '').toLowerCase();
  const rSum = (/insurance/.test(cL) ? 'Underwriting slashing and lockup risk apply.'
    : /rwa|cedefi|card/.test(cL) ? 'Custody, KYC, and issuer solvency apply.'
      : /derivative|prediction|option/.test(cL) ? 'Monitor funding, slippage, and margin.'
        : 'Monitor audits, oracles, and liquidity.') + (row.sibling_symbol ? ` Sibling ${row.sibling_symbol}.` : '');
  const payTxt = minT != null ? `pays from $${minT.toLocaleString('en-US')}` : `diluted at ${(cApr * 100).toFixed(0)}% carry`;
  const step = (phase, when, action, cost_usd, cost_label, minutes, time_label) =>
    ({ phase, when, action, cost_usd, cost_label, minutes, time_label });
  const items = [
    step('SETUP', 'Day 0', `Configure ${sub(walT)} on ${ch} with ${sub(gasT)} (${gasTier}; unconfirmed drop).`,
      r2(sf * 0.35), `${fFee(r2(sf * 0.35))} gas`, 8, '8 min'),
    step('VERIFY', 'Day 0', `Open ${row.name} via DefiLlama/docs, bookmark URL, check contracts.`, 0, 'free', 5, '5 min'),
    step('FUND', 'Day 0', `Bridge $${dF} native ${ch} assets (${stl} finality).`,
      r2(sf * 0.65), `${fFee(r2(sf * 0.65))} bridge`, 7, '7 min'),
    step('ENTER', 'Day 1', `$100 test tx, verify tracking, deploy $${dF}: ${coreActionFor(row, ch, fam, dep)}`,
      0, `$${dF} capital`, cm, `${cm} min`),
    step('CADENCE', `Weeks 1–${wk}`, `Hold ${wk} weeks via ${cad} (${wkM} min/wk; avoid churn).`,
      wf, `${fFee(wf)}/${wk}w`, wm, `${wkM} min/wk`),
    step('RISK', 'Ongoing', rSum, 0, 'free check', 2, '2 min'),
    step('STOP RULE', 'Any day', `Exit if TVL < $${(exitTvl / 1e6).toFixed(1)}M (-${p05.toFixed(1)}% P05); ${cln}.`,
      ef, `${fFee(ef)} exit`, 5, '5 min'),
    step('CLAIM', 'At launch', `Watch ${row.name} channels for TGE claim, verify contract, log receipts.`,
      0, 'free check', 5, '5 min'),
    step('BUDGET', 'Summary', `$${tf.toFixed(2)} fee + $${carryUsd.toFixed(2)} (${(cApr * 100).toFixed(0)}% carry) vs ` +
      `$${dropUsd.toFixed(2)} = ${exUsd >= 0 ? '+' : ''}$${exUsd.toFixed(2)} (${payTxt}) -> ${verdict}.`, 0, 'review', 3, '3 min'),
  ];
  return {
    ...b, best_chain: ch, chain_family: fam, family_label: b.family_label || fam, gas_tier: b.gas_tier || gasTier,
    deposit_usd: dep, min_ticket_usd: minT, drop_share: ds, horizon_weeks: wk, carry_apr: cApr,
    total_fees_usd: tf, total_minutes: tm, total_hours: th, modelled_drop_usd: dropUsd, net_of_fees_usd: netUsd,
    tbill_hurdle_usd: carryUsd, tbill_4pct_usd: carry4, net_per_hour: netHr, excess_after_carry_usd: exUsd,
    excess_per_hour: exHr, verdict, break_even_drop_share: beDrop, break_even_odds: beOdds, exit_tvl_usd: exitTvl, items,
  };
}

function computeFnv1aChecksum(rows) {
  let h = 0x811c9dc5;
  for (let i = 0; i < rows.length; i++) {
    const s = `${rows[i].slug}:${rows[i].implied_value_usd}\n`;
    for (let j = 0; j < s.length; j++) h = Math.imul(h ^ s.charCodeAt(j), 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function verifyBoardParity(radar) {
  const cal = radar.calibration, pm = cal.price_model, om = cal.odds_model;
  const pFit = fitStage1Huber(radar.raw_comps, pm.ref_tvl_usd, pm.cat_ridge_k);
  const oFit = fitStage2Logistic(radar.raw_peers, om);
  const valAbl = valueLadder(radar.raw_comps, pm.wf_cutoff), oddAbl = oddsLadder(radar.raw_peers, om);
  const refitPriceOk = Math.abs(pFit.intercept - pm.intercept) <= 1e-4 && Math.abs(pFit.beta_tvl - pm.beta_tvl) <= 1e-4;
  const refitOddsOk = ['intercept', 'beta_age', 'beta_legacy', 'beta_cat_share', 'beta_tvl', 'beta_g7d']
    .every((k) => Math.abs(oFit[k] - om[k]) <= 1e-4);
  const ablationOk = Math.abs(valAbl.ridge.loo_miss - pm.loo_miss) <= 0.002 &&
    Math.abs(valAbl.ridge.wf_miss - pm.wf_miss) <= 0.002 &&
    Math.abs(oddAbl.cv10_brier - om.cv10_brier) <= 0.002 && Math.abs(oddAbl.wf_brier - om.wf_brier) <= 0.002;
  let recomputedTotal = 0, mismatches = 0, farmMismatches = 0, monoOk = true, wlCount = 0;
  const chk = [];
  for (let i = 0; i < radar.rows.length; i++) {
    const r = radar.rows[i], v = impliedValue(r, pFit, oFit, cal), pl = farmPlan({ ...r, farm_items: [] }, cal);
    recomputedTotal += v.implied;
    if (v.implied !== r.implied_value_usd || v.launchOdds !== r.launch_odds || v.valueIfLaunched !== r.value_if_launched_usd ||
        v.low !== r.implied_low_usd || v.high !== r.implied_high_usd) mismatches++;
  const fe = r.farm_econ;
    if (Math.abs(pl.excess_after_carry_usd - fe.excess_after_carry_usd) > 0.011 ||
        Math.abs(pl.excess_per_hour - fe.excess_per_hour) > 0.011 ||
        Math.abs(pl.net_of_fees_usd - fe.net_of_fees_usd) > 0.011 ||
        pl.min_ticket_usd !== fe.min_ticket_usd || pl.total_minutes !== fe.total_minutes ||
        pl.verdict !== fe.verdict || pl.items.length !== 9) farmMismatches++;
    if (r.rank !== i + 1 || (i > 0 && radar.rows[i - 1].implied_value_usd < r.implied_value_usd)) monoOk = false;
    if (r.tier === 'watchlist') wlCount++;
    chk.push({ slug: r.slug, implied_value_usd: v.implied });
  }
  const checksum = computeFnv1aChecksum(chk), K = radar.ledger;
  const ledgerSum = K.watchlist + K.large_cap + K.early + K.priced_comps + K.other_tokenized +
    K.excl_bridges + K.excl_lst_btc + K.excl_cex_ver_sib;
  return { pFit, oFit, valAbl, oddAbl, refitPriceOk, refitOddsOk, ablationOk, mismatches, farmMismatches, monoOk,
    recomputedTotal, checksum, totalExactOk: recomputedTotal === radar.summary.total_implied_usd &&
      recomputedTotal === cal.board_total_implied_usd, checksumOk: checksum === cal.board_checksum,
    wlOk: wlCount === 40 && K.watchlist === 40, ledgerSum, ledgerOk: ledgerSum === K.total && K.total === 758 };
}

window.RADAR_MODEL = {
  ledgerOf, classifyProtocolUniverse: ledgerOf, median, solveLinearSystem, fitStage1Huber, valueLadder,
  fitStage2Logistic, oddsLadder, impliedValue, evaluateProtocol: impliedValue, calcMinTicketUsd,
  farmPlan, buildFarmPlan: farmPlan, computeFnv1aChecksum, verifyBoardParity,
};
window.__RADAR_PARITY = window.RADAR_MODEL;
})();

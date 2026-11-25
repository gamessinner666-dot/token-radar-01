'use strict';
(() => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sigmoid = (z) => 1 / (1 + Math.exp(-clamp(z, -20, 20)));
  const r2 = (n) => Math.round(n * 100) / 100, r3 = (n) => Math.round(n * 1000) / 1000;
  const r4 = (n) => Math.round(n * 10000) / 10000, cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  const SECTORS = [
    'Credit & Stablecoins', 'Staking, Restaking & Infra', 'Yield, Basis & Farming',
    'Trading & Derivatives', 'Asset Mgmt & Curators', 'RWA, Payments & Insurance',
  ];
  const EXCL = new Set(('CEX,Bridge,Canonical Bridge,Cross Chain Bridge,Liquid Staking,Liquid Restaking,' +
    'Restaked BTC,Anchor BTC,Decentralized BTC,Stablecoin Wrapper,Token Locker,Launchpad').split(','));
  const VER_RE = /(\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)|[A-Za-z]V\d+)$/;
  const WRAP_RE = /\b(wrapped|staked|staking)\b/i;
  const CEX_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

  function classifyProtocolUniverse(p, floorUsd) {
    if (!(p.mcap_usd === null && p.gecko_id === null && p.symbol === null)) {
      return { bucket: p.mcap_usd > 0 ? 'live_comp' : 'tokenized', eligible: false };
    }
    const cat = p.category || '';
    if (EXCL.has(cat) || VER_RE.test(p.name) || WRAP_RE.test(p.name) || CEX_RE.test(p.name)) {
      return { bucket: 'set_aside', eligible: false };
    }
    return { bucket: p.tvl_usd >= (floorUsd || 50e6) ? 'extended_or_watchlist' : 'early', eligible: true };
  }

  function median(vals) {
    if (!vals.length) return 0;
    const s = vals.slice().sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function solveLinearSystem(A, b) {
    const n = b.length, aug = A.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < n; i++) {
      let piv = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(aug[r][i]) > Math.abs(aug[piv][i])) piv = r;
      if (piv !== i) [aug[i], aug[piv]] = [aug[piv], aug[i]];
      const pv = Math.abs(aug[i][i]) < 1e-12 ? 1e-12 : aug[i][i];
      for (let j = i; j <= n; j++) aug[i][j] /= pv;
      for (let r = 0; r < n; r++) {
        if (r === i) continue;
        const f = aug[r][i];
        for (let j = i + 1; j <= n; j++) aug[r][j] -= f * aug[i][j];
      }
    }
    return aug.map((row) => row[n]);
  }

  function fitStage1Huber(comps, refTvl, ridgeK) {
    const ref = refTvl || 100e6, k = ridgeK || 0;
    const lt = comps.map((c) => Math.log(c.tvl_usd / ref)), lm = comps.map((c) => Math.log(c.mcap_usd / ref));
    const w = new Array(comps.length).fill(1);
    let coef = [0, 0];
    for (let it = 0; it < 25; it++) {
      const M = [[0, 0], [0, 1e-4]], rhs = [0, 0];
      for (let i = 0; i < comps.length; i++) {
        const wi = w[i], x1 = lt[i];
        rhs[0] += wi * lm[i]; rhs[1] += wi * x1 * lm[i];
        M[0][0] += wi; M[0][1] += wi * x1; M[1][0] += wi * x1; M[1][1] += wi * x1 * x1;
      }
      coef = solveLinearSystem(M, rhs);
      for (let i = 0; i < comps.length; i++) {
        const err = Math.abs(lm[i] - (coef[0] + coef[1] * lt[i]));
        w[i] = err <= 1.35 ? 1 : 1.35 / err;
      }
    }
    const cat_adj = {};
    if (k > 0) {
      const byCat = new Map();
      comps.forEach((c, i) => {
        const cat = c.category || 'Uncategorized', list = byCat.get(cat) || [];
        list.push(lm[i] - (coef[0] + coef[1] * lt[i]));
        byCat.set(cat, list);
      });
      for (const [cat, res] of [...byCat.entries()].sort((a, b) => cmp(a[0], b[0]))) {
        cat_adj[cat] = r4(res.reduce((acc, v) => acc + v, 0) / (res.length + k));
      }
    }
    return { ref_tvl_usd: ref, intercept: r4(coef[0]), beta_tvl: r4(coef[1]), cat_adj };
  }

  function runValueAblation(comps, wfCut) {
    const dated = comps.filter((c) => c.listed_at).sort((a, b) => cmp(a.listed_at, b.listed_at));
    const cut = wfCut || (dated[dated.length >> 1] ? dated[dated.length >> 1].listed_at : '2024-07-15');
    const trn = comps.filter((c) => !c.listed_at || c.listed_at < cut);
    const tst = comps.filter((c) => c.listed_at && c.listed_at >= cut);
    const ev = (mode) => {
      const pred = (tr, tg) => {
        if (mode === 'flat') return Math.max(1, tg.tvl_usd * Math.exp(median(tr.map((c) => Math.log(c.mcap_usd / c.tvl_usd)))));
        const f = fitStage1Huber(tr, 100e6, mode === 'ridge' ? 64 : 0);
        const adj = mode === 'ridge' ? (f.cat_adj[tg.category || 'Uncategorized'] || 0) : 0;
        return Math.max(1, Math.exp(Math.log(f.ref_tvl_usd) + f.intercept +
          f.beta_tvl * Math.log(tg.tvl_usd / f.ref_tvl_usd) + adj));
      };
      const loo = comps.map((c, i) => Math.abs(Math.log(c.mcap_usd / pred(comps.filter((_, j) => j !== i), c))));
      const wf = tst.map((c) => Math.abs(Math.log(c.mcap_usd / pred(trn, c))));
      return { loo_miss: r3(Math.exp(median(loo))), wf_miss: r3(Math.exp(median(wf))) };
    };
    return { flat: ev('flat'), curve: ev('curve'), ridge: ev('ridge') };
  }

  function peerFeats(p, om) {
    const ay = p.age_days == null ? om.median_age_years : p.age_days / 365;
    const g = p.change_7d == null ? om.global_med_7d : p.change_7d;
    const f = [1, Math.log(ay + 0.15), p.age_days == null ? 1 : 0];
    for (let s = 0; s < 5; s++) f.push(p.sector === SECTORS[s] ? 1 : 0);
    f.push(Math.log(p.tvl_usd / 50e6), Math.tanh((g - om.global_med_7d) / 35));
    return f;
  }

  function fitOddsVec(peers, om) {
    const X = peers.map((p) => peerFeats(p, om)), dim = X[0].length, coef = new Array(dim).fill(0);
    for (let it = 0; it < 20; it++) {
      const H = Array.from({ length: dim }, (_, i) => Array.from({ length: dim }, (_, j) => (i === j && i > 0 ? 1.5 : 0)));
      const gr = new Array(dim).fill(0);
      for (let i = 0; i < peers.length; i++) {
        const xi = X[i];
        let z = 0;
        for (let j = 0; j < dim; j++) z += coef[j] * xi[j];
        const pr = sigmoid(z), wt = Math.max(1e-6, pr * (1 - pr)), err = peers[i].y - pr;
        for (let j = 0; j < dim; j++) {
          gr[j] += err * xi[j];
          for (let k = 0; k < dim; k++) H[j][k] += wt * xi[j] * xi[k];
        }
      }
      for (let j = 1; j < dim; j++) gr[j] -= 1.5 * coef[j];
      const step = solveLinearSystem(H, gr);
      for (let j = 0; j < dim; j++) coef[j] += step[j];
    }
    return coef;
  }

  function fitStage2Logistic(peers, om) {
    const c = fitOddsVec(peers, om);
    return {
      intercept: r4(c[0]), beta_age: r4(c[1]), beta_legacy: r4(c[2]),
      beta_sectors: [3, 4, 5, 6, 7].map((i) => r4(c[i])), beta_tvl: r4(c[8]), beta_g7d: r4(c[9]),
    };
  }

  function runOddsAblation(peers, om) {
    const dated = peers.filter((p) => p.listed_at).sort((a, b) => cmp(a.listed_at, b.listed_at));
    const cut = om.wf_cutoff || (dated[Math.floor(dated.length * 0.55)] || {}).listed_at || '2025-05-29';
    const sumB = (c, list) => list.reduce((acc, p) => {
      const f = peerFeats(p, om);
      let z = 0;
      for (let j = 0; j < f.length; j++) z += c[j] * f[j];
      return acc + (p.y - sigmoid(z)) ** 2;
    }, 0);
    let cv = 0;
    for (let fold = 0; fold < 10; fold++) {
      cv += sumB(fitOddsVec(peers.filter((_, i) => i % 10 !== fold), om), peers.filter((_, i) => i % 10 === fold));
    }
    const trn = peers.filter((p) => !p.listed_at || p.listed_at < cut);
    const tst = peers.filter((p) => p.listed_at && p.listed_at >= cut);
    return { cv10_brier: r3(cv / peers.length), wf_brier: r3(sumB(fitOddsVec(trn, om), tst) / tst.length) };
  }

  function evaluateProtocol(row, pFit, oFit, cal) {
    const pm = cal.price_model, om = cal.odds_model, cat = row.category || 'Uncategorized';
    const catAdj = Object.prototype.hasOwnProperty.call(pFit.cat_adj, cat) ? pFit.cat_adj[cat] : 0;
    const baseMult = Math.exp(pFit.intercept), catMult = Math.exp(catAdj);
    const sizeMult = Math.exp(pFit.beta_tvl * Math.log(row.tvl_usd / pFit.ref_tvl_usd));
    const valueIfLaunched = Math.max(1, Math.round(pFit.ref_tvl_usd * baseMult * sizeMult * catMult));

    const ay = row.age_days == null ? om.median_age_years : row.age_days / 365;
    const leg = row.age_days == null ? 1 : 0, sIdx = SECTORS.indexOf(row.sector);
    const sectorAdj = sIdx >= 0 && sIdx < 5 ? (oFit.beta_sectors[sIdx] || 0) : 0;
    const g7d = row.change_7d == null ? om.global_med_7d : row.change_7d;
    const st = oFit.intercept + sectorAdj + oFit.beta_tvl * Math.log(row.tvl_usd / 50e6);
    const g7Term = oFit.beta_g7d * Math.tanh((g7d - om.global_med_7d) / 35);
    const pMax = sigmoid(st + oFit.beta_age * Math.log(om.max_age_years + 0.15));
    const pNow = sigmoid(st + oFit.beta_age * Math.log(ay + 0.15) + oFit.beta_legacy * leg + g7Term);
    const cond = clamp(Math.max(0.05, pMax - pNow) / Math.max(0.05, 1 - pNow), 0.15, 0.92);
    const launchOdds = r4(row.sibling_symbol != null ? Math.max(0.10, cond * 0.50) : cond);
    const implied = Math.max(1, Math.round(valueIfLaunched * launchOdds));
    const sc = (pm.sector_conformal_scales && pm.sector_conformal_scales[row.sector]) || 1;
    const low = Math.max(1, Math.round(implied * Math.exp(pm.zq25 * sc)));
    const high = Math.max(implied, Math.round(implied * Math.exp(pm.zq75 * sc)));
    const p10 = Math.max(1, Math.round(implied * Math.exp(pm.zq10 * sc)));
    const p90 = Math.max(high, Math.round(implied * Math.exp(pm.zq90 * sc)));
    return {
      valueIfLaunched, launchOdds, implied, baseMult, sizeMult, catMult, catAdj, sectorAdj, pNow, pMax, sc,
      low, high, p10, p90,
    };
  }

  const CHAIN_FAMILIES = {
    evm_l2: [1.15, 0.08, 0.25, 1000, 40, 5, 'bi-weekly organic rebalance'],
    eth_l1: [18, 0, 12, 5000, 45, 3, 'deposit-and-hold (no weekly L1 churn)'],
    solana: [0.55, 0.02, 0.05, 1000, 35, 5, 'bi-weekly organic rebalance'],
    bitcoin: [5.5, 0, 5.5, 2500, 55, 4, 'open-and-hold channel liquidity'],
    btc_l2: [3.5, 0.35, 2, 2000, 45, 5, 'hold across unbonding epochs'],
    bittensor: [0.25, 0.05, 0.15, 1500, 45, 4, 'periodic subnet yield check'],
    algorand: [0.25, 0.01, 0.05, 1000, 40, 4, 'bi-weekly organic check-in'],
    cosmos_ibc: [0.4, 0.03, 0.15, 1000, 40, 4, 'bi-weekly organic check-in'],
    xrpl_stellar: [0.35, 0.02, 0.1, 1500, 40, 4, 'epoch hold'],
    alt_vm: [0.8, 0.06, 0.25, 1000, 40, 5, 'bi-weekly organic check-in'],
  };

  function buildFarmPlan(row, cal, depOvr, dropOvr, wkOvr) {
    const base = row.farm_econ || {};
    const fam = base.chain_family || 'evm_l2';
    const [sfRaw, wfWk, efRaw, minFloor, baseMins, weeklyMins, cad] =
      CHAIN_FAMILIES[fam] || CHAIN_FAMILIES.evm_l2;
    const ds = dropOvr == null ? cal.default_drop_share : dropOvr;
    const wk = wkOvr == null ? cal.default_horizon_weeks : wkOvr;
    const defDep = base.deposit_usd ||
      Math.min(25_000, Math.max(minFloor, Math.round((row.tvl_usd * 0.0002) / 500) * 500));
    const dep = depOvr && depOvr > 0 ? depOvr : defDep;
    const sf = r2(sfRaw), wf = r2(wfWk * wk), ef = r2(efRaw), tf = r2(sf + wf + ef);
    const wm = weeklyMins * wk, tm = baseMins + wm, th = r2(tm / 60), dil = dep / (row.tvl_usd + dep);
    const dropUsd = r2(row.implied_value_usd * ds * dil), netUsd = r2(dropUsd - tf);
    const carry = r2(dep * cal.tbill_apr * (wk / 52)), netHr = r2(netUsd / Math.max(0.25, th));
    const exUsd = r2(netUsd - carry), exHr = r2(exUsd / Math.max(0.25, th));
    const verdict = exUsd > 0 && exHr >= cal.farm_hourly_hurdle ? 'FARM' : exUsd > 0 ? 'MARGINAL' : 'SKIP';
    const den = row.implied_value_usd * dil, beDrop = den > 0 ? r2((tf / den) * 10000) / 10000 : 1;
    const beOdds = row.implied_value_usd > 0 && row.launch_odds > 0
      ? r3(Math.min(1, tf / ((row.implied_value_usd / row.launch_odds) * ds * dil))) : 1;
    const p05 = Math.abs(cal.snapshot_7d_p05);
    const exitTvlUsd = Math.round(row.tvl_usd * (1 - clamp(p05 / 100, 0.12, 0.25)));
    const isDef = dep === base.deposit_usd && Math.abs(ds - cal.default_drop_share) < 1e-6 &&
      wk === cal.default_horizon_weeks;
    let items = row.farm_items || [];
    if (!isDef && items.length) {
      const dF = dep.toLocaleString('en-US'), ch = base.best_chain || 'Ethereum';
      const fStr = (v) => (v === 0 ? 'free' : `$${v.toFixed(2)}`);
      items = items.map((it) => {
        if (it.phase === 'FUND') return { ...it, action: it.action.replace(/\$[0-9,]+/, `$${dF}`) };
        if (it.phase === 'CORE') {
          return { ...it, cost_label: `$${dF} at risk`, action: `Deploy $${dF} via ${ch} (${it.time_label})` };
        }
        if (it.phase === 'CADENCE') {
          return {
            ...it, cost_label: `${fStr(wf)}/${wk}w`, time_label: `${weeklyMins}m/wk (${wm}m)`, minutes: wm,
            action: `Maintain for ${wk}w (${cad}, ${weeklyMins}m/wk).`,
          };
        }
        if (it.phase === 'BUDGET') {
          return {
            ...it, action: `Spend $${tf.toFixed(2)} fee + $${carry.toFixed(2)} carry vs ` +
              `$${dropUsd.toFixed(2)} = ${exUsd >= 0 ? '+' : ''}$${exUsd.toFixed(2)} (${exHr.toFixed(2)}/h -> ${verdict}).`,
          };
        }
        return it;
      });
    }
    return {
      ...base, deposit_usd: dep, drop_share: ds, horizon_weeks: wk, setup_fee_usd: sf,
      weekly_fee_per_week_usd: wfWk, weekly_fee_usd: wf, exit_fee_usd: ef, total_fees_usd: tf,
      total_minutes: tm, total_hours: th, modelled_drop_usd: dropUsd, net_of_fees_usd: netUsd,
      tbill_hurdle_usd: carry, net_per_hour: netHr, excess_after_carry_usd: exUsd, excess_per_hour: exHr,
      verdict, break_even_drop_share: beDrop, break_even_odds: beOdds, exit_tvl_usd: exitTvlUsd,
      cadence: base.cadence || cad, items,
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
    const valAbl = runValueAblation(radar.raw_comps, pm.wf_cutoff);
    const oddAbl = runOddsAblation(radar.raw_peers, om);
    const refitPriceOk = Math.abs(pFit.intercept - pm.intercept) <= 1e-4 && Math.abs(pFit.beta_tvl - pm.beta_tvl) <= 1e-4;
    const refitOddsOk = ['intercept', 'beta_age', 'beta_legacy', 'beta_tvl', 'beta_g7d']
      .every((k) => Math.abs(oFit[k] - om[k]) <= 1e-4);
    const ablationOk = Math.abs(valAbl.ridge.loo_miss - pm.loo_miss) <= 0.002 &&
      Math.abs(valAbl.ridge.wf_miss - pm.wf_miss) <= 0.002 &&
      Math.abs(oddAbl.cv10_brier - om.cv10_brier) <= 0.002 && Math.abs(oddAbl.wf_brier - om.wf_brier) <= 0.002;

    let recomputedTotal = 0, mismatches = 0, farmMismatches = 0, monoOk = true, wlCount = 0;
    const chk = [];
    for (let i = 0; i < radar.rows.length; i++) {
      const r = radar.rows[i], v = evaluateProtocol(r, pFit, oFit, cal), pl = buildFarmPlan(r, cal);
      recomputedTotal += v.implied;
      if (v.implied !== r.implied_value_usd || v.launchOdds !== r.launch_odds ||
          v.valueIfLaunched !== r.value_if_launched_usd ||
          v.low !== r.implied_low_usd || v.high !== r.implied_high_usd) mismatches++;
      if (Math.abs(pl.excess_after_carry_usd - r.farm_econ.excess_after_carry_usd) > 0.011 ||
          Math.abs(pl.excess_per_hour - r.farm_econ.excess_per_hour) > 0.011 ||
          Math.abs(pl.net_of_fees_usd - r.farm_econ.net_of_fees_usd) > 0.011 ||
          pl.total_minutes !== r.farm_econ.total_minutes ||
          pl.verdict !== r.farm_econ.verdict || pl.items.length !== 8) farmMismatches++;
      if (r.rank !== i + 1 || (i > 0 && radar.rows[i - 1].implied_value_usd < r.implied_value_usd)) monoOk = false;
      if (r.tier === 'watchlist') wlCount++;
      chk.push({ slug: r.slug, implied_value_usd: v.implied });
    }
    const checksum = computeFnv1aChecksum(chk), L = radar.ledger;
    const ledgerSum = L.watchlist + L.large_cap + L.early + L.priced_comps + L.other_tokenized +
      L.excl_bridges + L.excl_lst_btc + L.excl_cex_ver_sib;
    return {
      pFit, oFit, valAbl, oddAbl, refitPriceOk, refitOddsOk, ablationOk, mismatches, farmMismatches,
      monoOk, recomputedTotal, checksum,
      totalExactOk: recomputedTotal === radar.summary.total_implied_usd && recomputedTotal === cal.board_total_implied_usd,
      checksumOk: checksum === cal.board_checksum, wlOk: wlCount === 40 && L.watchlist === 40,
      ledgerSum, ledgerOk: ledgerSum === L.total && L.total === 758,
    };
  }

  window.RADAR_MODEL = {
    classifyProtocolUniverse, median, solveLinearSystem, fitStage1Huber, runValueAblation,
    fitStage2Logistic, runOddsAblation, evaluateProtocol, buildFarmPlan, computeFnv1aChecksum, verifyBoardParity,
  };
  window.__RADAR_PARITY = window.RADAR_MODEL;
})();

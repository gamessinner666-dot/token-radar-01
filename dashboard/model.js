'use strict';
(() => {
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const sig = (z) => 1 / (1 + Math.exp(-clamp(z, -20, 20)));
  const rN = (n, d) => Math.round(n * 10 ** d) / 10 ** d;
  const byC = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const SEC = 'Credit & Stablecoins|Staking, Restaking & Infra|Yield, Basis & Farming|Trading & Derivatives|Asset Mgmt & Curators|RWA, Payments & Insurance'.split('|');

  function median(vs) {
    if (!vs.length) return 0;
    const s = vs.slice().sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function solveSys(mat, rhs) {
    const n = rhs.length, a = mat.map((r, i) => [...r, rhs[i]]);
    for (let i = 0; i < n; i++) {
      let b = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[b][i])) b = r;
      if (b !== i) [a[i], a[b]] = [a[b], a[i]];
      const p = Math.abs(a[i][i]) < 1e-12 ? 1e-12 : a[i][i];
      for (let j = i; j <= n; j++) a[i][j] /= p;
      for (let r = 0; r < n; r++) if (r !== i) for (let j = i + 1, f = a[r][i]; j <= n; j++) a[r][j] -= f * a[i][j];
    }
    return a.map((r) => r[n]);
  }

  function fitStage1Huber(comps, refTvl, ridgeK) {
    const ref = refTvl || 1e8, k = ridgeK || 0;
    const X = comps.map((c) => [1, Math.log(c.tvl_usd / ref)]), Y = comps.map((c) => Math.log(c.mcap_usd / ref));
    const w = new Array(comps.length).fill(1);
    let cf = [0, 0];
    for (let it = 0; it < 25; it++) {
      const A = [[0, 0], [0, 1e-4]], B = [0, 0];
      for (let i = 0; i < comps.length; i++) {
        const [x0, x1] = X[i], wi = w[i];
        B[0] += wi * x0 * Y[i]; B[1] += wi * x1 * Y[i];
        A[0][0] += wi * x0 * x0; A[0][1] += wi * x0 * x1; A[1][0] += wi * x1 * x0; A[1][1] += wi * x1 * x1;
      }
      cf = solveSys(A, B);
      for (let i = 0; i < comps.length; i++) {
        const e = Math.abs(Y[i] - (cf[0] + cf[1] * X[i][1]));
        w[i] = e <= 1.35 ? 1 : 1.35 / e;
      }
    }
    const cat_adj = {};
    if (k > 0) {
      const by = new Map();
      comps.forEach((c, i) => {
        const ct = c.category || 'Uncategorized', arr = by.get(ct) || [];
        arr.push(Y[i] - (cf[0] + cf[1] * X[i][1])); by.set(ct, arr);
      });
      for (const [ct, arr] of [...by.entries()].sort((a, b) => byC(a[0], b[0]))) {
        cat_adj[ct] = rN(arr.reduce((a, b) => a + b, 0) / (arr.length + k), 4);
      }
    }
    return { ref_tvl_usd: ref, intercept: rN(cf[0], 4), beta_tvl: rN(cf[1], 4), cat_adj };
  }

  function runValueAblation(comps, wfCut) {
    const dated = comps.filter((c) => c.listed_at).sort((a, b) => byC(a.listed_at, b.listed_at));
    const cut = wfCut || (dated[dated.length >> 1] ? dated[dated.length >> 1].listed_at : '2024-07-15');
    const trW = comps.filter((c) => !c.listed_at || c.listed_at < cut), teW = comps.filter((c) => c.listed_at && c.listed_at >= cut);
    const ev = (mode) => {
      const pred = (tr, tg) => {
        if (mode === 'flat') return Math.max(1, tg.tvl_usd * Math.exp(median(tr.map((c) => Math.log(c.mcap_usd / c.tvl_usd)))));
        const f = fitStage1Huber(tr, 1e8, mode === 'ridge' ? 64 : 0), adj = mode === 'ridge' ? (f.cat_adj[tg.category || 'Uncategorized'] || 0) : 0;
        return Math.max(1, Math.exp(Math.log(f.ref_tvl_usd) + f.intercept + f.beta_tvl * Math.log(tg.tvl_usd / f.ref_tvl_usd) + adj));
      };
      return {
        loo_miss: rN(Math.exp(median(comps.map((c, idx) => Math.abs(Math.log(c.mcap_usd / pred(comps.filter((_, j) => j !== idx), c)))))), 3),
        wf_miss: rN(Math.exp(median(teW.map((c) => Math.abs(Math.log(c.mcap_usd / pred(trW, c)))))), 3),
      };
    };
    return { flat: ev('flat'), curve: ev('curve'), ridge: ev('ridge') };
  }

  function peerFeats(p, om) {
    const aY = p.age_days == null ? om.median_age_years : p.age_days / 365, g7 = p.change_7d == null ? om.global_med_7d : p.change_7d;
    const r = [1, Math.log(aY + 0.15), p.age_days == null ? 1 : 0];
    for (let s = 0; s < 5; s++) r.push(p.sector === SEC[s] ? 1 : 0);
    r.push(Math.log(p.tvl_usd / 5e7), Math.tanh((g7 - om.global_med_7d) / 35));
    return r;
  }

  function fitOddsMat(peers, om) {
    const X = peers.map((p) => peerFeats(p, om)), d = X[0].length, c = new Array(d).fill(0);
    for (let it = 0; it < 20; it++) {
      const H = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j && i > 0 ? 1.5 : 0))), g = new Array(d).fill(0);
      for (let i = 0; i < peers.length; i++) {
        const xi = X[i]; let z = 0;
        for (let j = 0; j < d; j++) z += c[j] * xi[j];
        const pr = sig(z), w = Math.max(1e-6, pr * (1 - pr)), diff = peers[i].y - pr;
        for (let j = 0; j < d; j++) { g[j] += diff * xi[j]; for (let k = 0; k < d; k++) H[j][k] += w * xi[j] * xi[k]; }
      }
      for (let j = 1; j < d; j++) g[j] -= 1.5 * c[j];
      const step = solveSys(H, g);
      for (let j = 0; j < d; j++) c[j] += step[j];
    }
    return c;
  }

  function fitStage2Logistic(peers, om) {
    const c = fitOddsMat(peers, om);
    return {
      intercept: rN(c[0], 4), beta_age: rN(c[1], 4), beta_legacy: rN(c[2], 4),
      beta_sectors: [3, 4, 5, 6, 7].map((i) => rN(c[i], 4)), beta_tvl: rN(c[8], 4), beta_g7d: rN(c[9], 4),
    };
  }

  function runOddsAblation(peers, om) {
    const dated = peers.filter((p) => p.listed_at).sort((a, b) => byC(a.listed_at, b.listed_at));
    const cut = om.wf_cutoff || (dated[Math.floor(dated.length * 0.55)] ? dated[Math.floor(dated.length * 0.55)].listed_at : '2025-05-29');
    const sc = (c, list) => list.reduce((s, p) => {
      const f = peerFeats(p, om); let z = 0;
      for (let j = 0; j < f.length; j++) z += c[j] * f[j];
      return s + (p.y - sig(z)) ** 2;
    }, 0);
    let b10 = 0;
    for (let f = 0; f < 10; f++) b10 += sc(fitOddsMat(peers.filter((_, i) => i % 10 !== f), om), peers.filter((_, i) => i % 10 === f));
    const tr = peers.filter((p) => !p.listed_at || p.listed_at < cut), te = peers.filter((p) => p.listed_at && p.listed_at >= cut);
    return { cv10_brier: rN(b10 / peers.length, 3), wf_brier: rN(sc(fitOddsMat(tr, om), te) / te.length, 3) };
  }

  function evaluateProtocol(row, pF, oF, cal) {
    const pm = cal.price_model, om = cal.odds_model, cat = row.category || 'Uncategorized';
    const catAdj = Object.prototype.hasOwnProperty.call(pF.cat_adj, cat) ? pF.cat_adj[cat] : 0;
    const baseMult = Math.exp(pF.intercept), sizeMult = Math.exp(pF.beta_tvl * Math.log(row.tvl_usd / pF.ref_tvl_usd)), catMult = Math.exp(catAdj);
    const valueIfLaunched = Math.max(1, Math.round(pF.ref_tvl_usd * baseMult * sizeMult * catMult));
    const ageY = row.age_days == null ? om.median_age_years : row.age_days / 365;
    const sI = SEC.indexOf(row.sector), secAdj = sI >= 0 && sI < 5 ? (oF.beta_sectors[sI] || 0) : 0;
    const g7 = row.change_7d == null ? om.global_med_7d : row.change_7d;
    const st = oF.intercept + secAdj + oF.beta_tvl * Math.log(row.tvl_usd / 5e7) + oF.beta_g7d * Math.tanh((g7 - om.global_med_7d) / 35);
    const pMax = sig(st + oF.beta_age * Math.log(om.max_age_years + 0.15));
    const pNow = sig(st + oF.beta_age * Math.log(ageY + 0.15) + oF.beta_legacy * (row.age_days == null ? 1 : 0));
    const cond = clamp(Math.max(0.05, pMax - pNow) / Math.max(0.05, 1 - pNow), 0.15, 0.92);
    const launchOdds = rN(row.sibling_symbol != null ? Math.max(0.1, cond * 0.5) : cond, 4);
    const implied = Math.max(1, Math.round(valueIfLaunched * launchOdds));
    return {
      valueIfLaunched, launchOdds, implied, baseMult, sizeMult, catMult, catAdj, secAdj, pNow, pMax,
      low: Math.max(1, Math.round(implied * Math.exp(pm.q25_log))), high: Math.max(implied, Math.round(implied * Math.exp(pm.q75_log))),
      p10: Math.max(1, Math.round(implied * Math.exp(pm.q10_log))), p90: Math.max(implied, Math.round(implied * Math.exp(pm.q90_log))),
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

  const LOW_GAS = 'Base|Arbitrum|Optimism|Polygon|Binance|Avalanche|Monad|Ink|Sonic|Scroll|Linea|Flare|Plume Mainnet|Mantle|Berachain|Hyperliquid L1|Unichain|World Chain|Katana|Soneium|Blast|Mode|Zircuit|zkSync Era|Taiko|Celo|Fraxtal|Etherlink|xDai|Sei|Plasma|Stable|Corn|Hemi|Morph|Arc|Fluent|Pharos|Rayls|Robinhood Chain|TAC|Tempo|XRPL EVM|Bittensor EVM'.split('|');
  const BTC_L2 = new Set('BSquared|CORE|Babylon Genesis|Stacks|Mezo|Citrea|BOB|Merlin|Bitlayer|Botanix|RSK'.split('|'));
  const IBC_CH = new Set('Noble|Nibiru|XION|Osmosis|Cosmos|Celestia|Injective|Kujira|Neutron|Stride|Secret|Akash|Dymension|Initia|Persistence|Stargaze|Archway|Saga|Terra|Terra2|dYdX|Thorchain|HydraDX'.split('|'));
  const ALT_VM = new Set('Sui|Aptos|Starknet|Tron|Cardano|Near|Provenance|Qubic|Canton|TON|Polkadot|Astar|Flow|Fuel|ICP|Hedera|Tezos|Radix|Waves|Aleo|Mina|Elrond|VeChain|Kaspa|Ergo|Filecoin|Eclipse'.split('|'));
  const FAM = {
    solana: ['Solana', 1, 'Phantom/Backpack', 'SOL', '<$0.05/tx', 0.55, 0.02, 0.05, 1000, 35, 5, 'bi-weekly', 'close SPL & revoke'],
    bitcoin: ['Bitcoin & LN', 4, 'BTC/LN wallet', 'BTC', '$5.50 L1', 5.5, 0, 5.5, 2500, 55, 4, 'hold LN', 'close channels to BTC'],
    bittensor: ['Bittensor', 2, 'TAO/Polkadot', 'TAO', '<$0.10/tx', 0.25, 0.05, 0.15, 1500, 45, 4, 'subnet check', 'unstake alpha to TAO'],
    algorand: ['Algorand', 1, 'Pera/Defly', 'ALGO', '<$0.02/tx', 0.25, 0.01, 0.05, 1000, 40, 4, 'bi-weekly', 'opt out unused ASAs'],
    eth_l1: ['Ethereum L1', 9, 'Rabby/HW', 'ETH', '$12-$18 L1', 18.0, 0, 12.0, 5000, 45, 3, 'hold-only', 'withdraw & revoke'],
  };
  const mkF = (k, ovr = []) => {
    const [familyLabel, costOrder, wallet, gasAsset, gasTier, setupFee, weeklyFee, exitFee, minFloor, baseMins, weeklyMins, cadence, cleanup] = ovr.length ? ovr : FAM[k];
    return { family: k, familyLabel, costOrder, wallet, gasAsset, gasTier, setupFee, weeklyFee, exitFee, minFloor, baseMins, weeklyMins, cadence, cleanup };
  };

  function classifyChainFamily(c) {
    if (c === 'Solana') return mkF('solana');
    if (c === 'Bitcoin') return mkF('bitcoin');
    if (BTC_L2.has(c)) return mkF('btc_l2', ['BTC L2', 3, `${c} wallet`, c === 'Stacks' ? 'STX' : c === 'CORE' ? 'CORE' : 'BTC', '$0.35-$3.50', 3.5, 0.35, 2.0, 2000, 45, 5, 'epoch hold', 'mind 7-21d cooldowns']);
    if (c === 'Bittensor') return mkF('bittensor');
    if (c === 'Algorand') return mkF('algorand');
    if (IBC_CH.has(c)) return mkF('cosmos_ibc', ['Cosmos IBC', 1, 'Keplr/Leap', c === 'Noble' ? 'IBC' : 'IBC gas', '<$0.05/tx', 0.4, 0.03, 0.15, 1000, 40, 4, 'bi-weekly', 'return via canonical IBC']);
    if (c === 'Ripple' || c === 'Stellar') {
      const xr = c === 'Ripple';
      return mkF('xrpl_stellar', [xr ? 'XRPL' : 'Stellar', 2, xr ? 'Xaman' : 'Freighter', xr ? 'XRP' : 'XLM', `<$0.02 + ${xr ? 'XRP' : 'XLM'}`, 0.35, 0.02, 0.1, 1500, 40, 4, 'epoch hold', 'remove trustlines']);
    }
    if (ALT_VM.has(c)) return mkF('alt_vm', [`${c} Alt-VM`, 2, `${c} wallet`, `${c} gas`, '$0.06-$0.80', 0.8, 0.06, 0.25, 1000, 40, 5, 'bi-weekly', 'clear session keys']);
    if (c === 'Ethereum') return mkF('eth_l1');
    return mkF('evm_l2', ['EVM L2 / Alt-L1', 0, 'Rabby/MetaMask', `${c} gas`, '$0.08-$0.30', 1.15, 0.08, 0.25, 1000, 40, 5, 'bi-weekly', 'revoke ERC-20 approvals']);
  }

  function selectBestChain(chains) {
    if (!chains || !chains.length) return { chain: 'Ethereum', profile: classifyChainFamily('Ethereum') };
    const r = chains.map((c) => ({ chain: c, profile: classifyChainFamily(c), pri: LOW_GAS.indexOf(c) >= 0 ? LOW_GAS.indexOf(c) : 1000 }));
    r.sort((a, b) => a.profile.costOrder - b.profile.costOrder || a.pri - b.pri || byC(a.chain, b.chain));
    return { chain: r[0].chain, profile: r[0].profile };
  }

  const planDepositUsd = (tvl, fl) => Math.min(25000, Math.max(fl, Math.round((tvl * 0.0002) / 500) * 500));
  const fF = (u) => (u === 0 ? 'free' : `$${u.toFixed(2)}`);

  function coreAct(p, ch, pr, cap) {
    const cat = (p.category || '').toLowerCase(), cs = cap.toLocaleString('en-US'), f = pr.family;
    if (f === 'bitcoin') return `Open BTC LN channel (${p.name}, $${cs} BTC).`;
    if (f === 'bittensor') return `Stake $${cs} TAO into ${p.name} dTAO.`;
    if (f === 'algorand') return `Supply $${cs} ASA into ${p.name}.`;
    if (f === 'cosmos_ibc') return `IBC $${cs} onto ${ch} (${p.name}).`;
    if (f === 'xrpl_stellar') return `Set ${ch} trustline, supply $${cs}.`;
    if (cat.includes('insurance')) return `Supply $${cs} underwriting (${ch}).`;
    if (/curator|allocator|aggregator|cdp manager|indexes/.test(cat)) return `Deposit $${cs} into vault (${ch}).`;
    if (/lend|cdp|collateral/.test(cat)) return `Supply $${cs} collateral (${ch}, <35% LTV).`;
    if (/dex|liquidity manager/.test(cat)) return `Provide $${cs} major LP (${ch}).`;
    if (/derivative|prediction|option|otc|synthetic/.test(cat)) return `Post $${cs} hedged margin (${ch}).`;
    if (/basis|yield|farm|governance/.test(cat) || cat === 'dor') return `Stake $${cs} yield receipt (${ch}).`;
    if (/rwa|cedefi|crypto card|payments/.test(cat)) return `KYC & hold $${cs} (${ch}).`;
    return `Deposit $${cs} ${ch} into core pool (${ch}).`;
  }

  function buildFarmTicket(p, cal, depO, dropO, wkO) {
    const ds = dropO == null ? cal.default_drop_share : dropO, wk = wkO == null ? cal.default_horizon_weeks : wkO;
    const p05 = cal.snapshot_7d_p05, { chain, profile: pr } = selectBestChain(p.chains);
    const dep = depO && depO > 0 ? depO : planDepositUsd(p.tvl_usd, pr.minFloor);
    const sF = rN(pr.setupFee, 2), wF = rN(pr.weeklyFee * wk, 2), xF = rN(pr.exitFee, 2), tF = rN(sF + wF + xF, 2);
    const wM = pr.weeklyMins * wk, tM = pr.baseMins + wM, tH = rN(tM / 60, 2);
    const dil = dep / (p.tvl_usd + dep), drop = rN(p.implied_value_usd * ds * dil, 2);
    const net = rN(drop - tF, 2), carry = rN(dep * cal.tbill_apr * (wk / 52), 2), netHr = rN(net / Math.max(0.25, tH), 2);
    const verdict = net > carry && netHr >= cal.farm_hourly_hurdle ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP';
    const den = p.implied_value_usd * dil, beDrop = den > 0 ? rN((tF / den) * 10000, 2) / 10000 : 1;
    const beOdds = p.implied_value_usd > 0 && p.launch_odds > 0 ? rN(Math.min(1, tF / ((p.implied_value_usd / p.launch_odds) * ds * dil)), 3) : 1;
    const exitTvl = Math.round(p.tvl_usd * (1 - clamp(Math.abs(p05) / 100, 0.12, 0.25)));
    const coreM = Math.max(5, pr.baseMins - 30), dStr = dep.toLocaleString('en-US');
    const secCh = p.chains.find((c) => c !== chain && classifyChainFamily(c).costOrder <= 2);
    const stp = (phase, action, cost_label, time_label) => ({ phase, action, cost_label, time_label });
    const items = [
      stp('SETUP', `Prepare ${pr.wallet} on ${chain} (${pr.gasAsset}, ${pr.gasTier}; unconfirmed).`, `${fF(rN(sF * 0.35, 2))} gas`, '8m'),
      stp('VERIFY', `Verify ${p.name} contracts via DefiLlama before signing.`, 'free', '5m'),
      stp('FUND', `Move $${dStr} native ${chain} assets onto ${chain}.`, `${fF(rN(sF * 0.65, 2))} xfer`, '7m'),
      stp('CORE', `Test $100 then $${dStr}: ${coreAct(p, chain, pr, dep)}`, `$${dStr} risk`, `${coreM}m`),
      stp('CADENCE', `Hold ${wk}w (${pr.cadence}, ${pr.weeklyMins}m/wk).${secCh ? ` Opt ${secCh}.` : ''}`, `${fF(wF)} / ${wk}w`, `${wM}m`),
      stp('RISK', p.sibling_symbol ? `Sibling ${p.sibling_symbol} trades; monitor audits.` : 'Monitor audits, oracles, utilization.', 'free', '2m'),
      stp('EXIT RULE', `Exit if TVL < $${(exitTvl / 1e6).toFixed(1)}M (${p05.toFixed(1)}% P05); ${pr.cleanup}.`, `${fF(xF)} exit`, '5m'),
      stp('BUDGET', `$${tF.toFixed(2)} fee + $${carry.toFixed(2)} carry vs $${drop.toFixed(2)} drop = ${net >= 0 ? '+' : ''}$${net.toFixed(2)} ($${netHr.toFixed(2)}/h ${verdict}).`, 'log', '3m'),
    ];
    return {
      best_chain: chain, chain_family: pr.family, family_label: pr.familyLabel, gas_tier: pr.gasTier, deposit_usd: dep,
      drop_share: ds, horizon_weeks: wk, total_fees_usd: tF, total_minutes: tM, total_hours: tH, modelled_drop_usd: drop,
      net_of_fees_usd: net, tbill_hurdle_usd: carry, net_per_hour: netHr, verdict,
      break_even_drop_share: beDrop, break_even_odds: beOdds, exit_tvl_usd: exitTvl, items,
    };
  }

  function verifyBoardParity(radar) {
    const C = radar.calibration, pm = C.price_model, om = C.odds_model;
    const pFit = fitStage1Huber(radar.raw_comps, pm.ref_tvl_usd, pm.cat_ridge_k), oFit = fitStage2Logistic(radar.raw_peers, om);
    const valAbl = runValueAblation(radar.raw_comps, pm.wf_cutoff), oddAbl = runOddsAblation(radar.raw_peers, om);
    const refitPriceOk = Math.abs(pFit.intercept - pm.intercept) <= 1e-4 && Math.abs(pFit.beta_tvl - pm.beta_tvl) <= 1e-4;
    const refitOddsOk = ['intercept', 'beta_age', 'beta_legacy', 'beta_tvl', 'beta_g7d'].every((k) => Math.abs(oFit[k] - om[k]) <= 1e-4);
    const ablationOk = Math.abs(valAbl.ridge.loo_miss - pm.loo_miss) <= 0.002 && Math.abs(valAbl.ridge.wf_miss - pm.wf_miss) <= 0.002 && Math.abs(oddAbl.cv10_brier - om.cv10_brier) <= 0.002 && Math.abs(oddAbl.wf_brier - om.wf_brier) <= 0.002;
    let recomputedTotal = 0, mismatches = 0, monoOk = true, wlCount = 0;
    const chk = [];
    for (let i = 0; i < radar.rows.length; i++) {
      const r = radar.rows[i], v = evaluateProtocol(r, pFit, oFit, C);
      recomputedTotal += v.implied;
      if (v.implied !== r.implied_value_usd || v.launchOdds !== r.launch_odds || v.valueIfLaunched !== r.value_if_launched_usd) mismatches++;
      if (r.rank !== i + 1 || (i > 0 && radar.rows[i - 1].implied_value_usd < r.implied_value_usd)) monoOk = false;
      if (r.tier === 'watchlist') wlCount++;
      chk.push({ slug: r.slug, implied_value_usd: v.implied });
    }
    const checksum = computeFnv1aChecksum(chk), L = radar.ledger;
    const ledgerSum = L.watchlist + L.large_cap + L.early + L.priced_comps + L.other_tokenized + L.excl_bridges + L.excl_lst_btc + L.excl_cex_ver_sib;
    return {
      pFit, oFit, valAbl, oddAbl, refitPriceOk, refitOddsOk, ablationOk, mismatches, monoOk,
      totalExactOk: recomputedTotal === radar.summary.total_implied_usd && recomputedTotal === C.board_total_implied_usd,
      recomputedTotal, checksum, checksumOk: checksum === C.board_checksum,
      wlOk: wlCount === 40 && L.watchlist === 40, ledgerSum, ledgerOk: ledgerSum === L.total && L.total === 758,
    };
  }

  window.RADAR_MODEL = {
    median, fitStage1Huber, runValueAblation, fitStage2Logistic, runOddsAblation, evaluateProtocol,
    computeFnv1aChecksum, classifyChainFamily, selectBestChain, planDepositUsd, buildFarmTicket, verifyBoardParity,
  };
  window.__RADAR_PARITY = window.RADAR_MODEL;
})();

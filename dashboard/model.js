'use strict';
(() => {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sigmoid = (z) => 1 / (1 + Math.exp(-clamp(z, -20, 20)));
  const r2 = (n) => Math.round(n * 100) / 100;
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const r4 = (n) => Math.round(n * 10000) / 10000;
  const cmpStr = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  const SECTORS = [
    'Credit & Stablecoins', 'Staking, Restaking & Infra', 'Yield, Basis & Farming',
    'Trading & Derivatives', 'Asset Mgmt & Curators', 'RWA, Payments & Insurance',
  ];

  function median(vals) {
    if (!vals.length) return 0;
    const s = vals.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function solveLinearSystem(A, b) {
    const n = b.length;
    const aug = A.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < n; i++) {
      let best = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(aug[r][i]) > Math.abs(aug[best][i])) best = r;
      if (best !== i) [aug[i], aug[best]] = [aug[best], aug[i]];
      const piv = Math.abs(aug[i][i]) < 1e-12 ? 1e-12 : aug[i][i];
      for (let j = i; j <= n; j++) aug[i][j] /= piv;
      for (let r = 0; r < n; r++) {
        if (r === i) continue;
        const f = aug[r][i];
        for (let j = i + 1; j <= n; j++) aug[r][j] -= f * aug[i][j];
      }
    }
    return aug.map((row) => row[n]);
  }

  function fitStage1Huber(comps, refTvl, ridgeK) {
    const ref = refTvl || 100_000_000;
    const k = ridgeK || 0;
    const X = comps.map((c) => [1, Math.log(c.tvl_usd / ref)]);
    const Y = comps.map((c) => Math.log(c.mcap_usd / ref));
    const w = new Array(comps.length).fill(1);
    let coef = [0, 0];
    for (let it = 0; it < 25; it++) {
      const m = [[0, 0], [0, 1e-4]];
      const rhs = [0, 0];
      for (let i = 0; i < comps.length; i++) {
        const [x0, x1] = X[i];
        const wi = w[i];
        rhs[0] += wi * x0 * Y[i];
        rhs[1] += wi * x1 * Y[i];
        m[0][0] += wi * x0 * x0;
        m[0][1] += wi * x0 * x1;
        m[1][0] += wi * x1 * x0;
        m[1][1] += wi * x1 * x1;
      }
      coef = solveLinearSystem(m, rhs);
      for (let i = 0; i < comps.length; i++) {
        const err = Math.abs(Y[i] - (coef[0] + coef[1] * X[i][1]));
        w[i] = err <= 1.35 ? 1 : 1.35 / err;
      }
    }
    const cat_adj = {};
    if (k > 0) {
      const byCat = new Map();
      comps.forEach((c, i) => {
        const cat = c.category || 'Uncategorized';
        const list = byCat.get(cat) || [];
        list.push(Y[i] - (coef[0] + coef[1] * X[i][1]));
        byCat.set(cat, list);
      });
      for (const [cat, res] of [...byCat.entries()].sort((a, b) => cmpStr(a[0], b[0]))) {
        cat_adj[cat] = r4(res.reduce((a, v) => a + v, 0) / (res.length + k));
      }
    }
    return { ref_tvl_usd: ref, intercept: r4(coef[0]), beta_tvl: r4(coef[1]), cat_adj };
  }

  function runValueAblation(comps, wfCutoff) {
    const dated = comps.filter((c) => c.listed_at).sort((a, b) => cmpStr(a.listed_at, b.listed_at));
    const cut = wfCutoff || (dated[dated.length >> 1] ? dated[dated.length >> 1].listed_at : '2024-07-15');
    const trn = comps.filter((c) => !c.listed_at || c.listed_at < cut);
    const tst = comps.filter((c) => c.listed_at && c.listed_at >= cut);
    const ev = (mode) => {
      const pred = (tr, tg) => {
        if (mode === 'flat') return Math.max(1, tg.tvl_usd * Math.exp(median(tr.map((c) => Math.log(c.mcap_usd / c.tvl_usd)))));
        const f = fitStage1Huber(tr, 100_000_000, mode === 'ridge' ? 64 : 0);
        const adj = mode === 'ridge' ? (f.cat_adj[tg.category || 'Uncategorized'] || 0) : 0;
        return Math.max(1, Math.exp(Math.log(f.ref_tvl_usd) + f.intercept + f.beta_tvl * Math.log(tg.tvl_usd / f.ref_tvl_usd) + adj));
      };
      const loo = comps.map((c, idx) => Math.abs(Math.log(c.mcap_usd / pred(comps.filter((_, j) => j !== idx), c))));
      const wf = tst.map((c) => Math.abs(Math.log(c.mcap_usd / pred(trn, c))));
      return { loo_miss: r3(Math.exp(median(loo))), wf_miss: r3(Math.exp(median(wf))) };
    };
    return { flat: ev('flat'), curve: ev('curve'), ridge: ev('ridge') };
  }

  function peerFeats(p, om) {
    const ay = p.age_days == null ? om.median_age_years : p.age_days / 365;
    const g = p.change_7d == null ? om.global_med_7d : p.change_7d;
    const row = [1, Math.log(ay + 0.15), p.age_days == null ? 1 : 0];
    for (let s = 0; s < 5; s++) row.push(p.sector === SECTORS[s] ? 1 : 0);
    row.push(Math.log(p.tvl_usd / 50_000_000), Math.tanh((g - om.global_med_7d) / 35));
    return row;
  }

  function fitOddsMatrix(peers, om) {
    const X = peers.map((p) => peerFeats(p, om));
    const dim = X[0].length;
    const pen = 1.5;
    const coef = new Array(dim).fill(0);
    for (let it = 0; it < 20; it++) {
      const H = Array.from({ length: dim }, (_, i) => Array.from({ length: dim }, (_, j) => (i === j && i > 0 ? pen : 0)));
      const gr = new Array(dim).fill(0);
      for (let i = 0; i < peers.length; i++) {
        const xi = X[i];
        let z = 0;
        for (let j = 0; j < dim; j++) z += coef[j] * xi[j];
        const pr = sigmoid(z);
        const wt = Math.max(1e-6, pr * (1 - pr));
        const err = peers[i].y - pr;
        for (let j = 0; j < dim; j++) {
          gr[j] += err * xi[j];
          for (let k = 0; k < dim; k++) H[j][k] += wt * xi[j] * xi[k];
        }
      }
      for (let j = 1; j < dim; j++) gr[j] -= pen * coef[j];
      const step = solveLinearSystem(H, gr);
      for (let j = 0; j < dim; j++) coef[j] += step[j];
    }
    return coef;
  }

  function fitStage2Logistic(peers, om) {
    const c = fitOddsMatrix(peers, om);
    return {
      intercept: r4(c[0]), beta_age: r4(c[1]), beta_legacy: r4(c[2]),
      beta_sectors: [3, 4, 5, 6, 7].map((i) => r4(c[i])), beta_tvl: r4(c[8]), beta_g7d: r4(c[9]),
    };
  }

  function runOddsAblation(peers, om) {
    const dated = peers.filter((p) => p.listed_at).sort((a, b) => cmpStr(a.listed_at, b.listed_at));
    const cut = om.wf_cutoff || (dated[Math.floor(dated.length * 0.55)] ? dated[Math.floor(dated.length * 0.55)].listed_at : '2025-05-29');
    const brier = (c, list) => list.reduce((acc, p) => {
      const f = peerFeats(p, om);
      let z = 0;
      for (let j = 0; j < f.length; j++) z += c[j] * f[j];
      return acc + (p.y - sigmoid(z)) ** 2;
    }, 0);
    let cv = 0;
    for (let f = 0; f < 10; f++) {
      cv += brier(fitOddsMatrix(peers.filter((_, i) => i % 10 !== f), om), peers.filter((_, i) => i % 10 === f));
    }
    const trn = peers.filter((p) => !p.listed_at || p.listed_at < cut);
    const tst = peers.filter((p) => p.listed_at && p.listed_at >= cut);
    return { cv10_brier: r3(cv / peers.length), wf_brier: r3(brier(fitOddsMatrix(trn, om), tst) / tst.length) };
  }

  function evaluateProtocol(r, pFit, oFit, cal) {
    const pm = cal.price_model;
    const om = cal.odds_model;
    const cat = r.category || 'Uncategorized';
    const catAdj = Object.prototype.hasOwnProperty.call(pFit.cat_adj, cat) ? pFit.cat_adj[cat] : 0;
    const baseMult = Math.exp(pFit.intercept);
    const sizeMult = Math.exp(pFit.beta_tvl * Math.log(r.tvl_usd / pFit.ref_tvl_usd));
    const catMult = Math.exp(catAdj);
    const valueIfLaunched = Math.max(1, Math.round(pFit.ref_tvl_usd * baseMult * sizeMult * catMult));
    const ay = r.age_days == null ? om.median_age_years : r.age_days / 365;
    const leg = r.age_days == null ? 1 : 0;
    const sIdx = SECTORS.indexOf(r.sector);
    const sectorAdj = sIdx >= 0 && sIdx < 5 ? (oFit.beta_sectors[sIdx] || 0) : 0;
    const g7d = r.change_7d == null ? om.global_med_7d : r.change_7d;
    const st = oFit.intercept + sectorAdj + oFit.beta_tvl * Math.log(r.tvl_usd / 50_000_000) +
      oFit.beta_g7d * Math.tanh((g7d - om.global_med_7d) / 35);
    const pMax = sigmoid(st + oFit.beta_age * Math.log(om.max_age_years + 0.15));
    const pNow = sigmoid(st + oFit.beta_age * Math.log(ay + 0.15) + oFit.beta_legacy * leg);
    const cond = clamp(Math.max(0.05, pMax - pNow) / Math.max(0.05, 1 - pNow), 0.15, 0.92);
    const launchOdds = r4(r.sibling_symbol != null ? Math.max(0.10, cond * 0.50) : cond);
    const implied = Math.max(1, Math.round(valueIfLaunched * launchOdds));
    return {
      valueIfLaunched, launchOdds, implied, baseMult, sizeMult, catMult, catAdj, sectorAdj, pNow, pMax,
      low: Math.max(1, Math.round(implied * Math.exp(pm.q25_log))),
      high: Math.max(implied, Math.round(implied * Math.exp(pm.q75_log))),
      p10: Math.max(1, Math.round(implied * Math.exp(pm.q10_log))),
      p90: Math.max(implied, Math.round(implied * Math.exp(pm.q90_log))),
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

  function repriceFarmScenario(r, cal, depOvr, dropOvr, wkOvr) {
    const b = r.farm_econ;
    const ds = dropOvr == null ? cal.default_drop_share : dropOvr;
    const wk = wkOvr == null ? cal.default_horizon_weeks : wkOvr;
    const dep = depOvr && depOvr > 0 ? depOvr : b.deposit_usd;
    if (dep === b.deposit_usd && Math.abs(ds - cal.default_drop_share) < 1e-6 && wk === cal.default_horizon_weeks) {
      return { ...b, items: r.farm_items };
    }
    const sf = r2(b.setup_fee_usd);
    const wf = r2(b.weekly_fee_per_week_usd * wk);
    const ef = r2(b.exit_fee_usd);
    const tf = r2(sf + wf + ef);
    const wm = b.weekly_minutes_per_week * wk;
    const tm = b.base_minutes + wm;
    const th = r2(tm / 60);
    const dil = dep / (r.tvl_usd + dep);
    const dropUsd = r2(r.implied_value_usd * ds * dil);
    const netUsd = r2(dropUsd - tf);
    const carry = r2(dep * cal.tbill_apr * (wk / 52));
    const netHr = r2(netUsd / Math.max(0.25, th));
    const verdict = netUsd > carry && netHr >= cal.farm_hourly_hurdle ? 'FARM' : netUsd > 0 ? 'MARGINAL' : 'SKIP';
    const den = r.implied_value_usd * dil;
    const beDrop = den > 0 ? r2((tf / den) * 10000) / 10000 : 1;
    const beOdds = r.implied_value_usd > 0 && r.launch_odds > 0
      ? r3(Math.min(1, tf / ((r.implied_value_usd / r.launch_odds) * ds * dil))) : 1;
    const dStr = dep.toLocaleString('en-US');
    const items = r.farm_items.map((it) => {
      if (it.phase === 'FUND') return { ...it, action: it.action.replace(/\$[\d,]+/, `$${dStr}`) };
      if (it.phase === 'CORE') {
        return {
          ...it,
          action: it.action.replace(/\$[\d,]+/g, (m) => (m === '$100' ? m : `$${dStr}`)),
          cost_label: `$${dStr} at risk`,
        };
      }
      if (it.phase === 'CADENCE') {
        return {
          ...it,
          action: it.action.replace(/\d+ weeks/, `${wk} weeks`),
          cost_label: `${wf === 0 ? 'free' : `$${wf.toFixed(2)}`} over ${wk}wk`,
          minutes: wm, time_label: `${b.weekly_minutes_per_week}m/wk (${wm}m)`,
        };
      }
      if (it.phase === 'BUDGET') {
        return {
          ...it,
          action: `Log tx hashes; $${tf.toFixed(2)} fees + $${carry.toFixed(2)} 2% carry spread vs ` +
            `$${dropUsd.toFixed(2)} drop = net ${netUsd >= 0 ? '+' : ''}$${netUsd.toFixed(2)} ` +
            `($${netHr.toFixed(2)}/h -> ${verdict}).`,
        };
      }
      return it;
    });
    return {
      ...b, deposit_usd: dep, drop_share: ds, horizon_weeks: wk, setup_fee_usd: sf, weekly_fee_usd: wf,
      exit_fee_usd: ef, total_fees_usd: tf, total_minutes: tm, total_hours: th, modelled_drop_usd: dropUsd,
      net_of_fees_usd: netUsd, tbill_hurdle_usd: carry, net_per_hour: netHr, verdict,
      break_even_drop_share: beDrop, break_even_odds: beOdds, items,
    };
  }

  function verifyBoardParity(radar) {
    const cal = radar.calibration;
    const pm = cal.price_model;
    const om = cal.odds_model;
    const pFit = fitStage1Huber(radar.raw_comps, pm.ref_tvl_usd, pm.cat_ridge_k);
    const oFit = fitStage2Logistic(radar.raw_peers, om);
    const valAbl = runValueAblation(radar.raw_comps, pm.wf_cutoff);
    const oddAbl = runOddsAblation(radar.raw_peers, om);
    const refitPriceOk = Math.abs(pFit.intercept - pm.intercept) <= 1e-4 && Math.abs(pFit.beta_tvl - pm.beta_tvl) <= 1e-4;
    const refitOddsOk = ['intercept', 'beta_age', 'beta_legacy', 'beta_tvl', 'beta_g7d']
      .every((k) => Math.abs(oFit[k] - om[k]) <= 1e-4);
    const ablationOk = Math.abs(valAbl.ridge.loo_miss - pm.loo_miss) <= 0.002 &&
      Math.abs(valAbl.ridge.wf_miss - pm.wf_miss) <= 0.002 &&
      Math.abs(oddAbl.cv10_brier - om.cv10_brier) <= 0.002 &&
      Math.abs(oddAbl.wf_brier - om.wf_brier) <= 0.002;
    let recomputedTotal = 0;
    let mismatches = 0;
    let monoOk = true;
    let wlCount = 0;
    const chk = [];
    for (let i = 0; i < radar.rows.length; i++) {
      const r = radar.rows[i];
      const v = evaluateProtocol(r, pFit, oFit, cal);
      recomputedTotal += v.implied;
      if (v.implied !== r.implied_value_usd || v.launchOdds !== r.launch_odds || v.valueIfLaunched !== r.value_if_launched_usd) {
        mismatches++;
      }
      if (r.rank !== i + 1 || (i > 0 && radar.rows[i - 1].implied_value_usd < r.implied_value_usd)) monoOk = false;
      if (r.tier === 'watchlist') wlCount++;
      chk.push({ slug: r.slug, implied_value_usd: v.implied });
    }
    const checksum = computeFnv1aChecksum(chk);
    const L = radar.ledger;
    const ledgerSum = L.watchlist + L.large_cap + L.early + L.priced_comps + L.other_tokenized +
      L.excl_bridges + L.excl_lst_btc + L.excl_cex_ver_sib;
    return {
      pFit, oFit, valAbl, oddAbl, refitPriceOk, refitOddsOk, ablationOk, mismatches, monoOk,
      totalExactOk: recomputedTotal === radar.summary.total_implied_usd && recomputedTotal === cal.board_total_implied_usd,
      recomputedTotal, checksum, checksumOk: checksum === cal.board_checksum,
      wlOk: wlCount === 40 && L.watchlist === 40, ledgerSum, ledgerOk: ledgerSum === L.total && L.total === 758,
    };
  }

  window.RADAR_MODEL = {
    median, solveLinearSystem, fitStage1Huber, runValueAblation, fitStage2Logistic, runOddsAblation,
    evaluateProtocol, computeFnv1aChecksum, repriceFarmScenario, verifyBoardParity,
  };
  window.__RADAR_PARITY = window.RADAR_MODEL;
})();

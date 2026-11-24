// radar-3 Two-Stage Empirical Valuation Engine:
// Stage 1: Huber log-TVL curve + category ridge (tested under LOO & Walk-Forward + placebo control)
// Stage 2: L2-logistic conditional token launch odds (tested under 10-fold CV & Walk-Forward + placebo)
// Plus conformal P25-P75 / P10-P90 intervals, 100 seeded bootstrap rank ranges, and FNV-1a checksum.

import {
  ageDays,
  buildComparables,
  clamp,
  compareCodeUnit,
  fitAndPredictPrice,
  fitLogisticOdds,
  median,
  quantile,
  sectorOf,
  sigmoid,
  type CompWithPlacebo,
  type StandalonePeer,
} from './comparables.ts';
import { discoverCandidates, isPreToken, isStandaloneForOdds } from './discovery.ts';
import { buildFarmEconomicsAndPlan } from './farming.ts';
import type {
  AblationRow,
  BoardRow,
  ComparableEntity,
  ModelCalibration,
  OddsAblationRow,
  RadarData,
  RadarRow,
  RowTier,
  Snapshot,
  SnapshotProtocol,
} from './types.ts';

export const MODEL_VERSION = 'radar-3' as const;
const DEFAULT_DROP_SHARE = 0.07;
const DEFAULT_HORIZON_WEEKS = 12;
const TBILL_APR = 0.04;
const FARM_HOURLY_HURDLE = 20;
const N_BOOTSTRAP = 100;
const CAT_RIDGE_K = 64;

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const round3 = (n: number): number => Math.round(n * 1_000) / 1_000;

/** Deterministic FNV-1a 32-bit hex checksum matching dashboard/app.js identically. */
export function fnv1aHex(rows: readonly { slug: string; implied_value_usd: number }[]): string {
  let h = 0x811c9dc5;
  for (const r of rows) {
    const line = `${r.slug}:${r.implied_value_usd}\n`;
    for (let i = 0; i < line.length; i++) {
      h ^= line.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Deterministic Mulberry32 PRNG for reproducible bootstrap rank intervals. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function buildStandalonePeers(snapshot: Snapshot, globalMed7d: number): {
  peers: StandalonePeer[];
  medianAgeYears: number;
  maxAgeYears: number;
} {
  const raw = snapshot.protocols.filter(isStandaloneForOdds);
  const ages = raw
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((d): d is number => d !== null)
    .map((d) => d / 365);
  const medianAgeYears = ages.length > 0 ? round4(median(ages)) : 1.85;
  const maxAgeYears = ages.length > 0 ? round4(Math.max(...ages)) : 5.0;

  const peers: StandalonePeer[] = raw.map((p) => {
    const d = ageDays(snapshot.as_of, p.listed_at);
    const ay = d === null ? null : d / 365;
    return {
      slug: p.slug,
      y: isPreToken(p) ? 0 : 1,
      sector: 'Yield, Basis & Farming', // assigned cleanly via category below if needed
      age_years: ay,
      age_filled: ay === null ? medianAgeYears : ay,
      listed_at: p.listed_at,
      ltvl: Math.log(p.tvl_usd / 50_000_000),
      g7d: Math.tanh(((p.change_7d ?? globalMed7d) - globalMed7d) / 35),
      lch: Math.log(Math.max(1, p.chains.length)),
      placebo: 0,
    };
  });

  // Assign deterministic shifted-row placebo
  for (let i = 0; i < peers.length; i++) {
    peers[i]!.placebo = peers[(i + 29) % peers.length]!.g7d;
  }
  return { peers, medianAgeYears, maxAgeYears };
}

export function calibrateModel(snapshot: Snapshot, comparables: ComparableEntity[]): ModelCalibration {
  const nonCex7d = snapshot.protocols
    .filter((p) => p.category !== 'CEX' && p.change_7d !== null)
    .map((p) => p.change_7d as number);
  const globalMed7d = round4(nonCex7d.length > 0 ? median(nonCex7d) : -8.23);
  const snapshotP05 = round4(nonCex7d.length > 0 ? quantile(nonCex7d, 0.05) : -17.0);

  // Add deterministic shifted-row placebo to comparables for Stage 1 control check
  const compsWithPlacebo: CompWithPlacebo[] = comparables.map((c, i) => ({
    ...c,
    placebo_g7d: comparables[(i + 17) % comparables.length]!.change_7d ?? globalMed7d,
  }));

  // Walk-forward temporal split (older 50% dated + undated -> newer 50% dated)
  const datedComps = compsWithPlacebo
    .filter((c) => c.listed_at !== null)
    .sort((a, b) => compareCodeUnit(a.listed_at!, b.listed_at!));
  const wfCutoff = datedComps[Math.floor(datedComps.length / 2)]?.listed_at ?? '2024-07-15';
  const wfTrain = compsWithPlacebo.filter((c) => c.listed_at === null || c.listed_at < wfCutoff);
  const wfTest = compsWithPlacebo.filter((c) => c.listed_at !== null && c.listed_at >= wfCutoff);

  const ablationSpecs: {
    step: string;
    opts: Parameters<typeof fitAndPredictPrice>[3];
    status: AblationRow['status'];
  }[] = [
    { step: 'Flat median mcap/TVL', opts: { flat: true }, status: 'baseline' },
    { step: '+ Size curve (Huber log-TVL)', opts: {}, status: 'kept' },
    { step: '+ Category ridge (k=64)', opts: { catK: CAT_RIDGE_K }, status: 'kept' },
    { step: '+ 6-Sector ridge (k=12)', opts: { secK: 12 }, status: 'tested_not_kept' },
    { step: '+ 7d TVL growth', opts: { catK: CAT_RIDGE_K, useG7d: true }, status: 'tested_not_kept' },
    { step: '+ Age (log years)', opts: { catK: CAT_RIDGE_K, useAge: true }, status: 'tested_not_kept' },
    { step: '+ Chain count (ln)', opts: { catK: CAT_RIDGE_K, useChains: true }, status: 'tested_not_kept' },
    { step: '+ Placebo: shifted row 7d', opts: { catK: CAT_RIDGE_K, usePlacebo: true }, status: 'control' },
  ];

  const ablation: AblationRow[] = [];
  let looSignedFinal: number[] = [];
  let wfSignedFinal: number[] = [];

  for (const spec of ablationSpecs) {
    const looSigned: number[] = [];
    for (let i = 0; i < compsWithPlacebo.length; i++) {
      const target = compsWithPlacebo[i]!;
      const train = compsWithPlacebo.filter((_, j) => j !== i);
      const { preds } = fitAndPredictPrice(train, [target], globalMed7d, spec.opts);
      const pred = preds[0]!;
      looSigned.push(Math.log(target.mcap_usd) - Math.log(pred));
      if (spec.step === '+ Category ridge (k=64)') {
        const comp = comparables[i]!;
        comp.loo_pred_usd = Math.round(pred);
        const ratio = comp.mcap_usd / pred;
        comp.loo_miss = round3(Math.max(ratio, 1 / ratio));
        comp.loo_dir = Math.abs(ratio - 1) < 0.02 ? 'exact' : ratio > 1 ? 'low' : 'high';
      }
    }
    const { preds: wfPreds } = fitAndPredictPrice(wfTrain, wfTest, globalMed7d, spec.opts);
    const wfSigned = wfTest.map((c, idx) => Math.log(c.mcap_usd) - Math.log(wfPreds[idx]!));

    const looAbs = looSigned.map(Math.abs);
    const wfAbs = wfSigned.map(Math.abs);
    ablation.push({
      step: spec.step,
      loo_miss: round3(Math.exp(median(looAbs))),
      wf_miss: round3(Math.exp(median(wfAbs))),
      loo_w3x: round3(looAbs.filter((e) => e <= Math.log(3)).length / looAbs.length),
      wf_w3x: round3(wfAbs.filter((e) => e <= Math.log(3)).length / wfAbs.length),
      status: spec.status,
    });

    if (spec.step === '+ Category ridge (k=64)') {
      looSignedFinal = looSigned;
      wfSignedFinal = wfSigned;
    }
  }

  const fullStage1 = fitAndPredictPrice(compsWithPlacebo, compsWithPlacebo, globalMed7d, { catK: CAT_RIDGE_K }).fit;
  const q25 = round4(quantile(looSignedFinal, 0.25));
  const q75 = round4(quantile(looSignedFinal, 0.75));
  const q10 = round4(quantile(looSignedFinal, 0.10));
  const q90 = round4(quantile(looSignedFinal, 0.90));

  const cov = (arr: readonly number[], lo: number, hi: number): number =>
    round3(arr.filter((r) => r >= lo && r <= hi).length / Math.max(1, arr.length));

  const keptAbl = ablation.find((r) => r.step === '+ Category ridge (k=64)')!;
  const flatAbl = ablation[0]!;

  // Stage 2: Token Launch Odds logistic model + ablation
  const { peers: standalone, medianAgeYears, maxAgeYears } = buildStandalonePeers(snapshot, globalMed7d);
  const sDated = standalone.filter((p) => p.listed_at !== null).sort((a, b) => compareCodeUnit(a.listed_at!, b.listed_at!));
  const oddsWfCut = sDated[Math.floor(sDated.length * 0.55)]?.listed_at ?? '2025-05-29';
  const sWfTr = standalone.filter((p) => p.listed_at === null || p.listed_at < oddsWfCut);
  const sWfTe = standalone.filter((p) => p.listed_at !== null && p.listed_at >= oddsWfCut);

  const oddsSpecs: {
    step: string;
    opts: Parameters<typeof fitLogisticOdds>[1];
    status: OddsAblationRow['status'];
  }[] = [
    { step: 'Base rate of peers', opts: {}, status: 'baseline' },
    { step: '+ Age (log years listed)', opts: { useAge: true }, status: 'kept' },
    { step: '+ Size (log TVL)', opts: { useAge: true, useTvl: true }, status: 'kept' },
    { step: '+ 7d TVL growth', opts: { useAge: true, useTvl: true, useG7d: true }, status: 'kept' },
    { step: '+ Chain count (ln)', opts: { useAge: true, useTvl: true, useG7d: true, useChains: true }, status: 'tested_not_kept' },
    { step: '+ Placebo: shifted row 7d', opts: { useAge: true, useTvl: true, useG7d: true, usePlacebo: true }, status: 'control' },
  ];

  const oddsAblation: OddsAblationRow[] = [];
  for (const os of oddsSpecs) {
    let b10 = 0;
    let a10 = 0;
    for (let f = 0; f < 10; f++) {
      const tr = standalone.filter((_, i) => i % 10 !== f);
      const te = standalone.filter((_, i) => i % 10 === f);
      const m = fitLogisticOdds(tr, os.opts);
      for (const pt of te) {
        const pr = m.predict(pt);
        b10 += (pt.y - pr) ** 2;
        if ((pr >= 0.5 ? 1 : 0) === pt.y) a10 += 1;
      }
    }
    const wfM = fitLogisticOdds(sWfTr, os.opts);
    let bWf = 0;
    let aWf = 0;
    for (const pt of sWfTe) {
      const pr = wfM.predict(pt);
      bWf += (pt.y - pr) ** 2;
      if ((pr >= 0.5 ? 1 : 0) === pt.y) aWf += 1;
    }
    oddsAblation.push({
      step: os.step,
      cv10_brier: round3(b10 / standalone.length),
      cv10_acc: round3(a10 / standalone.length),
      wf_brier: round3(bWf / sWfTe.length),
      wf_acc: round3(aWf / sWfTe.length),
      status: os.status,
    });
  }

  const fullOdds = fitLogisticOdds(standalone, {
    useAge: true,
    useTvl: true,
    useG7d: true,
  });
  const baseOddsAbl = oddsAblation[0]!;
  const keptOddsAbl = oddsAblation.find((r) => r.step === '+ 7d TVL growth')!;

  return {
    model_version: MODEL_VERSION,
    price_model: {
      ref_tvl_usd: fullStage1.ref_tvl_usd,
      intercept: fullStage1.intercept,
      beta_tvl: fullStage1.beta_tvl,
      cat_ridge_k: CAT_RIDGE_K,
      cat_adj: fullStage1.cat_adj,
      q25_log: q25,
      q75_log: q75,
      q10_log: q10,
      q90_log: q90,
      wf_cutoff: wfCutoff,
      n_comps: comparables.length,
      loo_miss: keptAbl.loo_miss,
      wf_miss: keptAbl.wf_miss,
      flat_loo_miss: flatAbl.loo_miss,
      flat_wf_miss: flatAbl.wf_miss,
      cov50_loo: cov(looSignedFinal, q25, q75),
      cov50_wf: cov(wfSignedFinal, q25, q75),
      cov80_loo: cov(looSignedFinal, q10, q90),
      cov80_wf: cov(wfSignedFinal, q10, q90),
      within3x_loo: keptAbl.loo_w3x,
      within3x_wf: keptAbl.wf_w3x,
      ablation,
    },
    odds_model: {
      intercept: round4(fullOdds.coef[0]!),
      beta_age: round4(fullOdds.coef[1]!),
      beta_tvl: round4(fullOdds.coef[2]!),
      beta_g7d: round4(fullOdds.coef[3]!),
      beta_chains: 0,
      median_age_years: medianAgeYears,
      max_age_years: maxAgeYears,
      global_med_7d: globalMed7d,
      base_rate: round3(standalone.filter((p) => p.y === 1).length / standalone.length),
      n_peers: standalone.length,
      wf_cutoff: oddsWfCut,
      cv10_brier: keptOddsAbl.cv10_brier,
      cv10_acc: keptOddsAbl.cv10_acc,
      wf_brier: keptOddsAbl.wf_brier,
      wf_acc: keptOddsAbl.wf_acc,
      base_cv10_brier: baseOddsAbl.cv10_brier,
      base_wf_brier: baseOddsAbl.wf_brier,
      ablation: oddsAblation,
    },
    snapshot_7d_p05: snapshotP05,
    board_checksum: '00000000',
    board_total_implied_usd: 0,
    default_drop_share: DEFAULT_DROP_SHARE,
    default_horizon_weeks: DEFAULT_HORIZON_WEEKS,
    tbill_apr: TBILL_APR,
    farm_hourly_hurdle: FARM_HOURLY_HURDLE,
    n_bootstrap: N_BOOTSTRAP,
  };
}

/** Exact deterministic valuation scoring shared identically with dashboard/app.js. */
export function computeRowValuation(
  p: SnapshotProtocol,
  age: number | null,
  siblingSymbol: string | null,
  cal: ModelCalibration,
): {
  valueIfLaunched: number;
  launchOdds: number;
  implied: number;
  p25: number;
  p75: number;
  p10: number;
  p90: number;
} {
  const pm = cal.price_model;
  const om = cal.odds_model;

  const cat = p.category ?? 'Uncategorized';
  const adj = pm.cat_adj[cat] ?? 0;
  const logVal = Math.log(pm.ref_tvl_usd) + pm.intercept + pm.beta_tvl * Math.log(p.tvl_usd / pm.ref_tvl_usd) + adj;
  const valueIfLaunched = Math.max(1, Math.round(Math.exp(logVal)));

  const ageYears = age === null ? om.median_age_years : age / 365;
  const ltvl = Math.log(p.tvl_usd / 50_000_000);
  const g7d = Math.tanh(((p.change_7d ?? om.global_med_7d) - om.global_med_7d) / 35);
  const lch = Math.log(Math.max(1, p.chains.length));
  const staticTerm = om.intercept + om.beta_tvl * ltvl + om.beta_g7d * g7d + om.beta_chains * lch;

  const pMax = sigmoid(staticTerm + om.beta_age * Math.log(om.max_age_years + 0.15));
  const pNow = sigmoid(staticTerm + om.beta_age * Math.log(ageYears + 0.15));
  const condOdds = clamp(Math.max(0.05, pMax - pNow) / Math.max(0.05, 1 - pNow), 0.15, 0.92);
  const finalOdds = siblingSymbol !== null ? Math.max(0.10, condOdds * 0.50) : condOdds;
  const launchOdds = round4(finalOdds);

  const implied = Math.max(1, Math.round(valueIfLaunched * launchOdds));
  const p25 = Math.max(1, Math.round(implied * Math.exp(pm.q25_log)));
  const p75 = Math.max(implied, Math.round(implied * Math.exp(pm.q75_log)));
  const p10 = Math.max(1, Math.round(implied * Math.exp(pm.q10_log)));
  const p90 = Math.max(p75, Math.round(implied * Math.exp(pm.q90_log)));

  return { valueIfLaunched, launchOdds, implied, p25, p75, p10, p90 };
}

function computeBootstrapRankRanges(
  snapshot: Snapshot,
  comparables: readonly ComparableEntity[],
  candidates: readonly { protocol: SnapshotProtocol; age: number | null; sibling_symbol: string | null }[],
  cal: ModelCalibration,
): Map<string, { low: number; high: number }> {
  const rng = mulberry32(20_261_114);
  const { peers: standalone } = buildStandalonePeers(snapshot, cal.odds_model.global_med_7d);
  const rankLists = new Map<string, number[]>(candidates.map((c) => [c.protocol.slug, []]));

  for (let b = 0; b < N_BOOTSTRAP; b++) {
    const compBoot: CompWithPlacebo[] = [];
    for (let i = 0; i < comparables.length; i++) {
      compBoot.push(comparables[Math.floor(rng() * comparables.length)]!);
    }
    const standBoot: StandalonePeer[] = [];
    for (let i = 0; i < standalone.length; i++) {
      standBoot.push(standalone[Math.floor(rng() * standalone.length)]!);
    }
    const pFit = fitAndPredictPrice(compBoot, compBoot, cal.odds_model.global_med_7d, { catK: CAT_RIDGE_K }).fit;
    const oFit = fitLogisticOdds(standBoot, { useAge: true, useTvl: true, useG7d: true }).coef;

    const scores = candidates.map((cand) => {
      const p = cand.protocol;
      const adj = pFit.cat_adj[p.category ?? 'Uncategorized'] ?? 0;
      const val = Math.exp(
        Math.log(pFit.ref_tvl_usd) + pFit.intercept + pFit.beta_tvl * Math.log(p.tvl_usd / pFit.ref_tvl_usd) + adj,
      );
      const ay = cand.age === null ? cal.odds_model.median_age_years : cand.age / 365;
      const st =
        oFit[0]! +
        oFit[2]! * Math.log(p.tvl_usd / 50_000_000) +
        oFit[3]! * Math.tanh(((p.change_7d ?? cal.odds_model.global_med_7d) - cal.odds_model.global_med_7d) / 35);
      const pMax = sigmoid(st + oFit[1]! * Math.log(cal.odds_model.max_age_years + 0.15));
      const pNow = sigmoid(st + oFit[1]! * Math.log(ay + 0.15));
      let odds = clamp(Math.max(0.05, pMax - pNow) / Math.max(0.05, 1 - pNow), 0.15, 0.92);
      if (cand.sibling_symbol !== null) odds = Math.max(0.10, odds * 0.50);
      return { slug: p.slug, tvl: p.tvl_usd, imp: val * odds };
    });

    scores.sort((x, y) => y.imp - x.imp || y.tvl - x.tvl || compareCodeUnit(x.slug, y.slug));
    scores.forEach((s, idx) => rankLists.get(s.slug)!.push(idx + 1));
  }

  const out = new Map<string, { low: number; high: number }>();
  for (const [slug, arr] of rankLists.entries()) {
    out.set(slug, {
      low: Math.max(1, Math.round(quantile(arr, 0.10))),
      high: Math.min(candidates.length, Math.round(quantile(arr, 0.90))),
    });
  }
  return out;
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const comparables = buildComparables(snapshot);
  const compSlugs = new Set(comparables.map((c) => c.slug));
  const discovery = discoverCandidates(snapshot, compSlugs);
  const calibration = calibrateModel(snapshot, comparables);

  const enriched = discovery.candidates.map((c) => ({
    ...c,
    age: ageDays(snapshot.as_of, c.protocol.listed_at),
  }));

  const rankRanges = computeBootstrapRankRanges(snapshot, comparables, enriched, calibration);

  const scored = enriched.map((c) => {
    const p = c.protocol;
    const val = computeRowValuation(p, c.age, c.sibling_symbol, calibration);
    const farm = buildFarmEconomicsAndPlan(
      p,
      val.implied,
      val.launchOdds,
      c.flags,
      c.sibling_symbol,
      calibration.snapshot_7d_p05,
    );
    const rr = rankRanges.get(p.slug) ?? { low: 1, high: enriched.length };
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      sector: sectorOf(p.category),
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: 'records-no-token' as const,
      tier: c.tier as RowTier,
      age_days: c.age,
      value_if_launched_usd: val.valueIfLaunched,
      launch_odds: val.launchOdds,
      implied_value_usd: val.implied,
      implied_low_usd: val.p25,
      implied_high_usd: val.p75,
      implied_p10_usd: val.p10,
      implied_p90_usd: val.p90,
      rank_low: rr.low,
      rank_high: rr.high,
      flags: c.flags,
      sibling_symbol: c.sibling_symbol,
      farm_econ: farm.econ,
      farm_steps: farm.steps,
    };
  });

  // Resolve exact sector from comparables sectorOf helper
  scored.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      b.tvl_usd - a.tvl_usd ||
      compareCodeUnit(a.slug, b.slug),
  );

  const board: BoardRow[] = scored.map((r, i) => ({
    rank: i + 1,
    ...r,
  }));

  calibration.board_checksum = fnv1aHex(board);
  let totalImp = 0;
  let totalTvl = 0;
  let farmCount = 0;
  let marginalCount = 0;
  let skipCount = 0;
  const distinctChains = new Set<string>();

  for (const r of board) {
    totalImp += r.implied_value_usd;
    totalTvl += r.tvl_usd;
    if (r.farm_econ.verdict === 'FARM') farmCount += 1;
    else if (r.farm_econ.verdict === 'MARGINAL') marginalCount += 1;
    else skipCount += 1;
    for (const ch of r.chains) distinctChains.add(ch);
  }
  calibration.board_total_implied_usd = totalImp;

  const radarRows: RadarRow[] = board.map((r) => ({
    rank: r.rank,
    rank_low: r.rank_low,
    rank_high: r.rank_high,
    slug: r.slug,
    name: r.name,
    category: r.category,
    sector: r.sector,
    chains: r.chains,
    tvl_usd: r.tvl_usd,
    change_7d: r.change_7d,
    listed_at: r.listed_at,
    tier: r.tier,
    age_days: r.age_days,
    value_if_launched_usd: r.value_if_launched_usd,
    launch_odds: r.launch_odds,
    implied_value_usd: r.implied_value_usd,
    implied_low_usd: r.implied_low_usd,
    implied_high_usd: r.implied_high_usd,
    implied_p10_usd: r.implied_p10_usd,
    implied_p90_usd: r.implied_p90_usd,
    flags: r.flags,
    sibling_symbol: r.sibling_symbol,
    farm_econ: r.farm_econ,
  }));

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    ledger: discovery.ledger,
    calibration,
    summary: {
      total_protocols: discovery.ledger.total,
      board_size: board.length,
      watchlist_size: discovery.ledger.watchlist,
      large_cap_size: discovery.ledger.large_cap,
      early_size: discovery.ledger.early,
      comparables_total: comparables.length,
      farm_count: farmCount,
      marginal_count: marginalCount,
      skip_count: skipCount,
      total_board_tvl_usd: Math.round(totalTvl),
      total_implied_usd: totalImp,
      median_implied_usd: Math.round(median(board.map((r) => r.implied_value_usd))),
      distinct_chains: distinctChains.size,
    },
    rows: radarRows,
    live_comparables: comparables,
  };

  return { board, radar };
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

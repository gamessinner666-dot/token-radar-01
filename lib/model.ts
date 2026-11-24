// radar-2 Quantitative Valuation Engine:
// Empirical-Bayes 6-sector multiples, Huber-FE sub-linear TVL scaling, category-relative tanh growth,
// concave Lindy maturity (neutral 1.00 for null listed_at), IQR uncertainty bands, and LOOCV audit.

import {
  ageDays,
  buildComparables,
  clamp,
  compareCodeUnit,
  fitHuberFE,
  iqr,
  median,
  quantile,
  SECTORS,
  sectorOf,
} from './comparables.ts';
import { discoverCandidates } from './discovery.ts';
import { buildFarmPlan } from './farming.ts';
import type {
  BoardRow,
  CategoryStat,
  ComparableEntity,
  LoocvSummary,
  ModelCalibration,
  PeerSnippet,
  RadarData,
  RadarRow,
  RowTier,
  SectorName,
  SectorStat,
  Snapshot,
  SnapshotProtocol,
} from './types.ts';

export const MODEL_VERSION = 'radar-2' as const;

const GROWTH_WEIGHT = 0.18;
const GROWTH_SCALE = 35;
const MATURITY_FLOOR = 0.85;
const MATURITY_RANGE = 0.25;
const MATURITY_DAYS = 1095;
const K_SECTOR = 5;
const K_CATEGORY = 5;
const MIN_CAT_PEERS = 3;
const MIN_CAT_7D = 5;

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
const round3 = (n: number): number => Math.round(n * 1_000) / 1_000;

function toPeerSnippet(c: ComparableEntity): PeerSnippet {
  return {
    slug: c.slug,
    name: c.name,
    category: c.category,
    mcap_usd: c.mcap_usd,
    tvl_usd: c.tvl_usd,
    ratio: round4(c.ratio),
  };
}

/** Fit Empirical-Bayes peer log-multiples and category-relative 7d growth baselines. */
function fitMultiplesAndGrowth(
  allProtocols: readonly SnapshotProtocol[],
  core: readonly ComparableEntity[],
  refTvl: number,
  betaHuber: number,
): {
  global_log_k: number;
  global_iqr_log: number;
  global_med_7d: number;
  sector_stats: Record<SectorName, SectorStat>;
  category_stats: Record<string, CategoryStat>;
} {
  const coreLogK = core.map((c) => {
    const scaleTvl = refTvl * Math.pow(c.tvl_usd / refTvl, betaHuber);
    return Math.log(c.mcap_usd / scaleTvl);
  });

  const global_log_k = coreLogK.length > 0 ? median(coreLogK) : Math.log(0.2);
  const global_iqr_log = coreLogK.length > 1 ? iqr(coreLogK) : 1.2;

  // Non-CEX 7d growth baselines across the full snapshot
  const nonCex = allProtocols.filter((p) => p.category !== 'CEX' && p.change_7d !== null);
  const global7dVals = nonCex.map((p) => p.change_7d as number);
  const global_med_7d = global7dVals.length > 0 ? median(global7dVals) : 0;

  const sec7dMap = new Map<SectorName, number[]>();
  const cat7dMap = new Map<string, number[]>();
  const catAllCount = new Map<string, number>();

  for (const s of SECTORS) sec7dMap.set(s, []);
  for (const p of allProtocols) {
    if (p.category === 'CEX') continue;
    const cat = p.category ?? 'Uncategorized';
    catAllCount.set(cat, (catAllCount.get(cat) ?? 0) + 1);
    if (p.change_7d !== null) {
      cat7dMap.set(cat, [...(cat7dMap.get(cat) ?? []), p.change_7d]);
      sec7dMap.get(sectorOf(cat))!.push(p.change_7d);
    }
  }

  // Group core comparables by sector & category
  const secCore = new Map<SectorName, { c: ComparableEntity; lk: number }[]>();
  const catCore = new Map<string, { c: ComparableEntity; lk: number }[]>();
  for (const s of SECTORS) secCore.set(s, []);

  for (let i = 0; i < core.length; i++) {
    const c = core[i]!;
    const lk = coreLogK[i]!;
    secCore.get(c.sector)!.push({ c, lk });
    catCore.set(c.category, [...(catCore.get(c.category) ?? []), { c, lk }]);
  }

  const sector_stats = {} as Record<SectorName, SectorStat>;
  for (const sec of SECTORS) {
    const entries = secCore.get(sec)!;
    const lks = entries.map((e) => e.lk);
    const ratios = entries.map((e) => e.c.ratio).sort((a, b) => a - b);
    const n = entries.length;
    const rawMedLk = n > 0 ? median(lks) : global_log_k;
    const shrunkLk =
      n >= MIN_CAT_PEERS ? (n * rawMedLk + K_SECTOR * global_log_k) / (n + K_SECTOR) : global_log_k;
    const sec7d = sec7dMap.get(sec)!;
    const med7d = sec7d.length > 0 ? median(sec7d) : global_med_7d;
    const topPeers = [...entries]
      .sort((a, b) => b.c.tvl_usd - a.c.tvl_usd || compareCodeUnit(a.c.slug, b.c.slug))
      .slice(0, 4)
      .map((e) => toPeerSnippet(e.c));

    sector_stats[sec] = {
      n,
      log_k: round4(shrunkLk),
      iqr_log: round4(n >= 2 ? iqr(lks) : global_iqr_log),
      med_ratio: round4(ratios.length > 0 ? median(ratios) : Math.exp(shrunkLk)),
      p25_ratio: round4(ratios.length > 0 ? quantile(ratios, 0.25) : Math.exp(shrunkLk) * 0.5),
      p75_ratio: round4(ratios.length > 0 ? quantile(ratios, 0.75) : Math.exp(shrunkLk) * 2.0),
      med_7d: round4(med7d),
      top_peers: topPeers,
    };
  }

  const allCats = new Set<string>([...catAllCount.keys(), ...catCore.keys()]);
  const category_stats: Record<string, CategoryStat> = {};
  for (const cat of [...allCats].sort(compareCodeUnit)) {
    const sec = sectorOf(cat);
    const secStat = sector_stats[sec];
    const entries = catCore.get(cat) ?? [];
    const lks = entries.map((e) => e.lk);
    const ratios = entries.map((e) => e.c.ratio);
    const n = entries.length;
    const shrunkLk =
      n >= MIN_CAT_PEERS
        ? (n * median(lks) + K_CATEGORY * secStat.log_k) / (n + K_CATEGORY)
        : secStat.log_k;

    const c7d = cat7dMap.get(cat) ?? [];
    const med7d =
      c7d.length >= MIN_CAT_7D
        ? median(c7d)
        : c7d.length > 0
          ? (c7d.length * median(c7d) + MIN_CAT_7D * secStat.med_7d) / (c7d.length + MIN_CAT_7D)
          : secStat.med_7d;

    const topPeers =
      n >= MIN_CAT_PEERS
        ? [...entries]
            .sort((a, b) => b.c.tvl_usd - a.c.tvl_usd || compareCodeUnit(a.c.slug, b.c.slug))
            .slice(0, 4)
            .map((e) => toPeerSnippet(e.c))
        : secStat.top_peers;

    category_stats[cat] = {
      n,
      sector: sec,
      log_k: round4(shrunkLk),
      iqr_log: round4(n >= 5 ? iqr(lks) : secStat.iqr_log),
      med_ratio: round4(n >= MIN_CAT_PEERS ? median(ratios) : secStat.med_ratio),
      med_7d: round4(med7d),
      n_all: catAllCount.get(cat) ?? 0,
      top_peers: topPeers,
    };
  }

  return {
    global_log_k: round4(global_log_k),
    global_iqr_log: round4(global_iqr_log),
    global_med_7d: round4(global_med_7d),
    sector_stats,
    category_stats,
  };
}

/** Out-of-sample Leave-One-Out Cross-Validation across all clean entities vs starter radar-1. */
function runLoocv(
  snapshot: Snapshot,
  comparables: readonly ComparableEntity[],
  refTvl: number,
): LoocvSummary {
  const n = comparables.length;
  if (n === 0) {
    return {
      n: 0,
      rmsle: 0,
      mdale: 0,
      med_mult_err: 1,
      within_2x: 0,
      within_3x: 0,
      starter_rmsle: 0,
      starter_mdale: 0,
      starter_med_mult_err: 1,
      starter_within_3x: 0,
    };
  }

  const r2AbsErr: number[] = [];
  const r2SqErr: number[] = [];
  const s1AbsErr: number[] = [];
  const s1SqErr: number[] = [];

  for (const target of comparables) {
    const trainAll = comparables.filter((c) => c.slug !== target.slug);
    const trainCore = trainAll.filter((c) => c.is_core);
    const trainProtocols = snapshot.protocols.filter((p) => p.slug !== target.slug);
    const beta = fitHuberFE(trainCore);
    const fit = fitMultiplesAndGrowth(trainProtocols, trainCore, refTvl, beta);

    const secStat = fit.sector_stats[target.sector];
    const catStat = fit.category_stats[target.category];
    const logK = catStat ? catStat.log_k : secStat.log_k;
    const peerMult = Math.exp(logK);
    const peerMed7d = catStat ? catStat.med_7d : secStat.med_7d;
    const excess7d = target.change_7d === null ? 0 : target.change_7d - peerMed7d;
    const gMult = 1 + GROWTH_WEIGHT * Math.tanh(excess7d / GROWTH_SCALE);
    const mMult =
      target.age_days === null
        ? 1.0
        : MATURITY_FLOOR + MATURITY_RANGE * Math.sqrt(Math.min(target.age_days, MATURITY_DAYS) / MATURITY_DAYS);
    const scaleTvl = refTvl * Math.pow(target.tvl_usd / refTvl, beta);
    const predR2 = Math.max(1, scaleTvl * peerMult * gMult * mMult);
    const logErr2 = Math.log(predR2) - Math.log(target.mcap_usd);
    r2AbsErr.push(Math.abs(logErr2));
    r2SqErr.push(logErr2 * logErr2);

    // Starter radar-1 baseline evaluated on the same clean entity TVL/mcap
    const s1G = clamp(target.change_7d ?? 0, -60, 120);
    const s1GMult = 1 + (s1G / 100) * 0.5;
    const s1Age = target.age_days ?? 365;
    const s1MMult = 0.6 + (Math.min(Math.max(s1Age, 0), 1095) / 1095) * 0.4;
    const predS1 = Math.max(1, target.tvl_usd * 0.25 * s1GMult * s1MMult);
    const logErr1 = Math.log(predS1) - Math.log(target.mcap_usd);
    s1AbsErr.push(Math.abs(logErr1));
    s1SqErr.push(logErr1 * logErr1);
  }

  const r2Rmsle = Math.sqrt(r2SqErr.reduce((a, b) => a + b, 0) / n);
  const r2Mdale = median(r2AbsErr);
  const s1Rmsle = Math.sqrt(s1SqErr.reduce((a, b) => a + b, 0) / n);
  const s1Mdale = median(s1AbsErr);

  return {
    n,
    rmsle: round3(r2Rmsle),
    mdale: round3(r2Mdale),
    med_mult_err: round3(Math.exp(r2Mdale)),
    within_2x: round3(r2AbsErr.filter((e) => e <= Math.log(2)).length / n),
    within_3x: round3(r2AbsErr.filter((e) => e <= Math.log(3)).length / n),
    starter_rmsle: round3(s1Rmsle),
    starter_mdale: round3(s1Mdale),
    starter_med_mult_err: round3(Math.exp(s1Mdale)),
    starter_within_3x: round3(s1AbsErr.filter((e) => e <= Math.log(3)).length / n),
  };
}

export function calibrateModel(
  snapshot: Snapshot,
  comparables: readonly ComparableEntity[],
  core: readonly ComparableEntity[],
): ModelCalibration {
  const refTvl = snapshot.floor_usd;
  const beta_huber = fitHuberFE(core);
  const fit = fitMultiplesAndGrowth(snapshot.protocols, core, refTvl, beta_huber);
  const loocv = runLoocv(snapshot, comparables, refTvl);

  return {
    model_version: MODEL_VERSION,
    ref_tvl_usd: refTvl,
    beta_huber,
    global_log_k: fit.global_log_k,
    global_iqr_log: fit.global_iqr_log,
    global_med_7d: fit.global_med_7d,
    growth_weight: GROWTH_WEIGHT,
    growth_scale: GROWTH_SCALE,
    maturity_floor: MATURITY_FLOOR,
    maturity_range: MATURITY_RANGE,
    maturity_days: MATURITY_DAYS,
    k_sector: K_SECTOR,
    k_category: K_CATEGORY,
    min_cat_peers: MIN_CAT_PEERS,
    min_cat_7d: MIN_CAT_7D,
    loocv,
    sector_stats: fit.sector_stats,
    category_stats: fit.category_stats,
  };
}

export function scoreProtocol(
  p: SnapshotProtocol,
  tier: RowTier,
  flags: string[],
  siblingSymbol: string | null,
  asOf: string,
  cal: ModelCalibration,
): Omit<BoardRow, 'rank'> {
  const cat = p.category ?? 'Uncategorized';
  const sec = sectorOf(cat);
  const secStat = cal.sector_stats[sec];
  const catStat = cal.category_stats[cat];
  const age = ageDays(asOf, p.listed_at);

  const scaleTvl = cal.ref_tvl_usd * Math.pow(p.tvl_usd / cal.ref_tvl_usd, cal.beta_huber);
  const peerSource: 'category' | 'sector' = catStat && catStat.n >= cal.min_cat_peers ? 'category' : 'sector';
  const logK = catStat ? catStat.log_k : secStat.log_k;
  const peerMultiple = Math.exp(logK);
  const peerN = peerSource === 'category' ? catStat!.n : secStat.n;
  const peerMed7d = catStat ? catStat.med_7d : secStat.med_7d;

  const excess7d = p.change_7d === null ? 0 : p.change_7d - peerMed7d;
  const growthMult = 1 + cal.growth_weight * Math.tanh(excess7d / cal.growth_scale);
  const maturityMult =
    age === null
      ? 1.0
      : cal.maturity_floor + cal.maturity_range * Math.sqrt(Math.min(age, cal.maturity_days) / cal.maturity_days);

  const implied = Math.max(1, Math.round(scaleTvl * peerMultiple * growthMult * maturityMult));

  const poolIqr =
    catStat && catStat.n >= 5
      ? catStat.iqr_log
      : secStat.n >= 5
        ? secStat.iqr_log
        : cal.global_iqr_log;
  const halfIqr = clamp(poolIqr / 2, 0.35, 1.10);
  const impliedLow = Math.max(1, Math.round(implied * Math.exp(-halfIqr)));
  const impliedHigh = Math.max(implied, Math.round(implied * Math.exp(halfIqr)));

  const depthPts = Math.min(30, peerN * 3);
  const tightPts = 20 * clamp(1 - (poolIqr - 0.5) / 2.0, 0, 1);
  const completePts = 10 - (p.change_7d === null ? 5 : 0) - (age === null ? 10 : 0);
  const siblingPenalty = siblingSymbol !== null ? 15 : 0;
  const confidence = clamp(Math.round(40 + depthPts + tightPts + completePts - siblingPenalty), 10, 98);

  const farm = buildFarmPlan(p, age, flags, siblingSymbol);

  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    sector: sec,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'records-no-token',
    tier,
    age_days: age,
    implied_value_usd: implied,
    implied_low_usd: impliedLow,
    implied_high_usd: impliedHigh,
    confidence_score: confidence,
    flags,
    sibling_symbol: siblingSymbol,
    model: {
      scale_tvl_usd: Math.round(scaleTvl),
      peer_multiple: round4(peerMultiple),
      peer_source: peerSource,
      peer_n: peerN,
      peer_iqr_log: round4(poolIqr),
      peer_med_7d: round4(peerMed7d),
      excess_7d: round4(excess7d),
      growth_multiplier: round4(growthMult),
      maturity_multiplier: round4(maturityMult),
      half_iqr: round4(halfIqr),
    },
    farm_meta: farm.meta,
    farm_steps: farm.steps,
  };
}

export function toRadarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    sector: row.sector,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    tier: row.tier,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    confidence_score: row.confidence_score,
    flags: row.flags,
    sibling_symbol: row.sibling_symbol,
    model: row.model,
    farm_meta: row.farm_meta,
  };
}

/** Build full board.json rows and compact dashboard RadarData deterministically from snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { comparables, core } = buildComparables(snapshot);
  const calibration = calibrateModel(snapshot, comparables, core);
  const discovery = discoverCandidates(snapshot);

  const unscored = discovery.candidates.map((c) =>
    scoreProtocol(c.protocol, c.tier, c.flags, c.sibling_symbol, snapshot.as_of, calibration),
  );

  unscored.sort(
    (a, b) =>
      b.implied_value_usd - a.implied_value_usd ||
      b.tvl_usd - a.tvl_usd ||
      compareCodeUnit(a.slug, b.slug),
  );

  const board: BoardRow[] = unscored.map((row, idx) => ({
    rank: idx + 1,
    ...row,
  }));

  const distinctChains = new Set<string>();
  let totalTvl = 0;
  let totalImplied = 0;
  const impliedList: number[] = [];
  for (const r of board) {
    totalTvl += r.tvl_usd;
    totalImplied += r.implied_value_usd;
    impliedList.push(r.implied_value_usd);
    for (const ch of r.chains) distinctChains.add(ch);
  }

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    calibration,
    summary: {
      total_protocols: discovery.counts.total_protocols,
      tokenized_excluded: discovery.counts.tokenized_excluded,
      raw_pre_token: discovery.counts.raw_pre_token,
      watchlist_size: discovery.counts.watchlist,
      large_cap_size: discovery.counts.large_cap,
      early_size: discovery.counts.early,
      board_size: board.length,
      comparables_total: comparables.length,
      comparables_core: core.length,
      total_board_tvl_usd: Math.round(totalTvl),
      total_implied_usd: Math.round(totalImplied),
      median_implied_usd: Math.round(median(impliedList)),
      distinct_chains: distinctChains.size,
    },
    rows: board.map(toRadarRow),
    live_comparables: comparables,
  };

  return { board, radar };
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

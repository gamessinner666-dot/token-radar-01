// Comparable universe construction, 6-sector taxonomy, Stage 1 Huber+Ridge price model,
// and Stage 2 L2-logistic token-odds model (Node 22 erasable TS, stdlib only).

import type { ComparableEntity, SectorName, Snapshot, SnapshotProtocol } from './types.ts';

export const SECTORS: readonly SectorName[] = [
  'Credit & Stablecoins',
  'Staking, Restaking & Infra',
  'Yield, Basis & Farming',
  'Trading & Derivatives',
  'Asset Mgmt & Curators',
  'RWA, Payments & Insurance',
] as const;

export const SECTOR_MAP: Record<string, SectorName> = {
  Lending: 'Credit & Stablecoins',
  'Uncollateralized Lending': 'Credit & Stablecoins',
  CDP: 'Credit & Stablecoins',
  'Dual-Token Stablecoin': 'Credit & Stablecoins',
  'Collateral Markets': 'Credit & Stablecoins',
  'Collateral Management': 'Credit & Stablecoins',
  'Stablecoin Wrapper': 'Credit & Stablecoins',
  'Stablecoin Issuer': 'Credit & Stablecoins',
  'Algo-Stables': 'Credit & Stablecoins',
  'Reserve Currency': 'Credit & Stablecoins',
  'Liquid Staking': 'Staking, Restaking & Infra',
  Restaking: 'Staking, Restaking & Infra',
  'Liquid Restaking': 'Staking, Restaking & Infra',
  'Staking Pool': 'Staking, Restaking & Infra',
  Chain: 'Staking, Restaking & Infra',
  Privacy: 'Staking, Restaking & Infra',
  'AI Agents': 'Staking, Restaking & Infra',
  'Decentralized AI': 'Staking, Restaking & Infra',
  Yield: 'Yield, Basis & Farming',
  'Basis Trading': 'Yield, Basis & Farming',
  'Leveraged Farming': 'Yield, Basis & Farming',
  Farm: 'Yield, Basis & Farming',
  CeDeFi: 'Yield, Basis & Farming',
  'Governance Incentives': 'Yield, Basis & Farming',
  DOR: 'Yield, Basis & Farming',
  Dexs: 'Trading & Derivatives',
  Derivatives: 'Trading & Derivatives',
  Options: 'Trading & Derivatives',
  'Options Vault': 'Trading & Derivatives',
  'Prediction Market': 'Trading & Derivatives',
  'OTC Marketplace': 'Trading & Derivatives',
  Synthetics: 'Trading & Derivatives',
  'Interest Rate Derivatives': 'Trading & Derivatives',
  'NFT Marketplace': 'Trading & Derivatives',
  'Risk Curators': 'Asset Mgmt & Curators',
  'Onchain Capital Allocator': 'Asset Mgmt & Curators',
  'Yield Aggregator': 'Asset Mgmt & Curators',
  'Liquidity Manager': 'Asset Mgmt & Curators',
  Indexes: 'Asset Mgmt & Curators',
  'CDP Manager': 'Asset Mgmt & Curators',
  RWA: 'RWA, Payments & Insurance',
  Payments: 'RWA, Payments & Insurance',
  'Crypto Card Issuer': 'RWA, Payments & Insurance',
  Insurance: 'RWA, Payments & Insurance',
};

export const EXCLUDED_COMP_CATEGORIES = new Set<string>([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Token Locker',
  'Launchpad',
]);

export function sectorOf(category: string | null): SectorName {
  if (category === null) return 'Yield, Basis & Farming';
  return SECTOR_MAP[category] ?? 'Yield, Basis & Farming';
}

const DAY_MS = 86_400_000;

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function compareCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function clamp(val: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, val));
}

export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 1) return s[0]!;
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(s.length - 1, lo + 1);
  const frac = pos - lo;
  return s[lo]! * (1 - frac) + s[hi]! * frac;
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

function brandStems(p: SnapshotProtocol): Set<string> {
  const stems = new Set<string>();
  const slugHead = p.slug.split('-')[0]?.toLowerCase() ?? '';
  if (slugHead.length >= 3) stems.add(slugHead);
  const nameHead =
    p.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')[0] ?? '';
  if (nameHead.length >= 3) stems.add(nameHead);
  if (p.gecko_id) {
    const geckoHead = p.gecko_id.split('-')[0]?.toLowerCase() ?? '';
    if (geckoHead.length >= 3) stems.add(geckoHead);
  }
  return stems;
}

function sharesBrandStem(a: SnapshotProtocol, b: SnapshotProtocol): boolean {
  const sa = brandStems(a);
  const sb = brandStems(b);
  for (const s of sa) {
    if (sb.has(s)) return true;
  }
  return false;
}

/** Build the 98 clean entity comparables (mcap_usd > 0, non-CEX/Bridge/Locker/Launchpad, brand+sector sibling TVL). */
export function buildComparables(snapshot: Snapshot): ComparableEntity[] {
  const bySymbol = new Map<string, SnapshotProtocol[]>();
  for (const p of snapshot.protocols) {
    if (p.symbol === null || p.symbol.trim() === '') continue;
    if (EXCLUDED_COMP_CATEGORIES.has(p.category ?? '')) continue;
    const key = p.symbol.trim().toLowerCase();
    const list = bySymbol.get(key) ?? [];
    list.push(p);
    bySymbol.set(key, list);
  }

  const comparables: ComparableEntity[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || !Number.isFinite(p.mcap_usd) || p.mcap_usd <= 0) continue;
    if (p.tvl_usd <= 0 || !Number.isFinite(p.tvl_usd)) continue;
    const cat = p.category ?? 'Uncategorized';
    if (EXCLUDED_COMP_CATEGORIES.has(cat)) continue;

    const sec = sectorOf(cat);
    let aggTvl = p.tvl_usd;
    let siblings = 1;
    const symKey = (p.symbol ?? '').trim().toLowerCase();
    if (symKey !== '') {
      for (const q of bySymbol.get(symKey) ?? []) {
        if (q.slug === p.slug) continue;
        if (q.mcap_usd !== null && q.mcap_usd > 0) continue;
        if (sectorOf(q.category) === sec && sharesBrandStem(p, q)) {
          aggTvl += q.tvl_usd;
          siblings += 1;
        }
      }
    }

    comparables.push({
      slug: p.slug,
      name: p.name,
      category: cat,
      sector: sec,
      symbol: p.symbol ?? '',
      chains: p.chains,
      raw_tvl_usd: p.tvl_usd,
      tvl_usd: aggTvl,
      mcap_usd: p.mcap_usd,
      ratio: p.mcap_usd / aggTvl,
      n_siblings: siblings,
      change_7d: p.change_7d,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      listed_at: p.listed_at,
      loo_pred_usd: 0,
      loo_miss: 1,
      loo_dir: 'exact',
    });
  }

  comparables.sort(
    (a, b) => b.mcap_usd - a.mcap_usd || b.tvl_usd - a.tvl_usd || compareCodeUnit(a.slug, b.slug),
  );
  return comparables;
}

export interface Stage1Fit {
  ref_tvl_usd: number;
  intercept: number;
  beta_tvl: number;
  cat_adj: Record<string, number>;
}

/** Solve small dense linear system A*x = b via Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let i = 0; i < n; i++) {
    let best = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r]![i]!) > Math.abs(M[best]![i]!)) best = r;
    }
    if (best !== i) {
      const tmp = M[i]!;
      M[i] = M[best]!;
      M[best] = tmp;
    }
    const piv = Math.abs(M[i]![i]!) < 1e-12 ? 1e-12 : M[i]![i]!;
    for (let j = i; j <= n; j++) M[i]![j]! /= piv;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r]![i]!;
      for (let j = i; j <= n; j++) M[r]![j]! -= f * M[i]![j]!;
    }
  }
  return M.map((r) => r[n]!);
}

export interface PriceEvalOpts {
  flat?: boolean;
  catK?: number;
  secK?: number;
  useG7d?: boolean;
  useAge?: boolean;
  useChains?: boolean;
  usePlacebo?: boolean;
}

export interface CompWithPlacebo extends ComparableEntity {
  placebo_g7d?: number;
}

/** General Stage 1 evaluator used for both the production fit and the dual ablation ladder. */
export function fitAndPredictPrice(
  train: readonly CompWithPlacebo[],
  test: readonly CompWithPlacebo[],
  globalMed7d: number,
  opts: PriceEvalOpts,
): { fit: Stage1Fit; preds: number[] } {
  const ref = 100_000_000;
  if (opts.flat) {
    const flatLogR = median(train.map((c) => Math.log(c.mcap_usd / c.tvl_usd)));
    const preds = test.map((c) => Math.max(1, c.tvl_usd * Math.exp(flatLogR)));
    return {
      fit: { ref_tvl_usd: ref, intercept: flatLogR, beta_tvl: 1, cat_adj: {} },
      preds,
    };
  }

  const feat = (c: CompWithPlacebo): number[] => {
    const row = [1, Math.log(c.tvl_usd / ref)];
    if (opts.useG7d) row.push(Math.tanh(((c.change_7d ?? globalMed7d) - globalMed7d) / 35));
    if (opts.useAge) row.push(c.age_days === null ? 0 : Math.log((c.age_days + 30) / 365));
    if (opts.useChains) row.push(Math.log(Math.max(1, c.chains.length)));
    if (opts.usePlacebo) row.push(Math.tanh(((c.placebo_g7d ?? globalMed7d) - globalMed7d) / 35));
    return row;
  };

  const X = train.map(feat);
  const Y = train.map((c) => Math.log(c.mcap_usd / ref));
  const p = X[0]!.length;
  const w = new Array<number>(train.length).fill(1);
  let coef = new Array<number>(p).fill(0);
  const delta = 1.35;

  for (let iter = 0; iter < 25; iter++) {
    const A = Array.from({ length: p }, (_, i) =>
      Array.from({ length: p }, (_, j) => (i === j && i > 0 ? 1e-4 : 0)),
    );
    const B = new Array<number>(p).fill(0);
    for (let i = 0; i < train.length; i++) {
      const xi = X[i]!;
      const yi = Y[i]!;
      const wi = w[i]!;
      for (let j = 0; j < p; j++) {
        B[j]! += wi * xi[j]! * yi;
        for (let k = 0; k < p; k++) A[j]![k]! += wi * xi[j]! * xi[k]!;
      }
    }
    coef = solveLinear(A, B);
    for (let i = 0; i < train.length; i++) {
      let pred = 0;
      for (let j = 0; j < p; j++) pred += coef[j]! * X[i]![j]!;
      const absR = Math.abs(Y[i]! - pred);
      w[i] = absR <= delta ? 1 : delta / absR;
    }
  }

  const resids = train.map((c, i) => {
    let pred = 0;
    for (let j = 0; j < p; j++) pred += coef[j]! * X[i]![j]!;
    return { c, r: Y[i]! - pred };
  });

  const secAdj = new Map<SectorName, number>();
  if (opts.secK && opts.secK > 0) {
    const byS = new Map<SectorName, number[]>();
    for (const x of resids) {
      const arr = byS.get(x.c.sector) ?? [];
      arr.push(x.r);
      byS.set(x.c.sector, arr);
    }
    for (const [sec, arr] of byS.entries()) {
      const meanR = arr.reduce((a, b) => a + b, 0) / arr.length;
      secAdj.set(sec, (arr.length * meanR) / (arr.length + opts.secK));
    }
  }

  const cat_adj: Record<string, number> = {};
  if (opts.catK && opts.catK > 0) {
    const byC = new Map<string, number[]>();
    for (const x of resids) {
      const arr = byC.get(x.c.category) ?? [];
      arr.push(x.r);
      byC.set(x.c.category, arr);
    }
    for (const [cat, arr] of [...byC.entries()].sort((a, b) => compareCodeUnit(a[0], b[0]))) {
      const prior = secAdj.get(sectorOf(cat)) ?? 0;
      const meanR = arr.reduce((a, b) => a + b, 0) / arr.length;
      cat_adj[cat] = Math.round(((arr.length * meanR + opts.catK * prior) / (arr.length + opts.catK)) * 10_000) / 10_000;
    }
  }

  const preds = test.map((c) => {
    const x = feat(c);
    let lp = 0;
    for (let j = 0; j < p; j++) lp += coef[j]! * x[j]!;
    const adj = opts.catK ? (cat_adj[c.category] ?? secAdj.get(c.sector) ?? 0) : (secAdj.get(c.sector) ?? 0);
    return Math.max(1, Math.exp(Math.log(ref) + lp + adj));
  });

  return {
    fit: {
      ref_tvl_usd: ref,
      intercept: Math.round(coef[0]! * 10_000) / 10_000,
      beta_tvl: Math.round(coef[1]! * 10_000) / 10_000,
      cat_adj,
    },
    preds,
  };
}

export interface StandalonePeer {
  slug: string;
  category?: string;
  y: number;
  sector: SectorName;
  age_years: number | null;
  age_filled: number;
  legacy: 0 | 1;
  listed_at: string | null;
  ltvl: number;
  g7d: number;
  lch: number;
  placebo: number;
}

export interface OddsEvalOpts {
  useAge?: boolean;
  useLegacy?: boolean;
  useSector?: boolean;
  useCatShare?: boolean;
  catK?: number;
  useTvl?: boolean;
  useG7d?: boolean;
  useChains?: boolean;
  usePlacebo?: boolean;
}

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-clamp(z, -20, 20)));

/** Fit L2-regularized logistic regression for token launch propensity across standalone protocols. */
export function fitLogisticOdds(
  train: readonly StandalonePeer[],
  opts: OddsEvalOpts,
): { coef: number[]; catLogitMap: Record<string, number>; predict: (p: StandalonePeer) => number } {
  const baseR = clamp(train.filter((r) => r.y === 1).length / Math.max(1, train.length), 0.05, 0.95);
  const catCounts = new Map<string, { n: number; y: number }>();
  if (opts.useCatShare) {
    for (const r of train) {
      const k = r.category ?? 'Uncategorized';
      const cur = catCounts.get(k) ?? { n: 0, y: 0 };
      cur.n += 1;
      cur.y += r.y;
      catCounts.set(k, cur);
    }
  }
  const m = opts.catK ?? 6;
  const baseLogit = Math.log(baseR / (1 - baseR));
  const catLogitMap: Record<string, number> = {};
  if (opts.useCatShare) {
    for (const [cat, s] of [...catCounts.entries()].sort((a, b) => compareCodeUnit(a[0], b[0]))) {
      const p = clamp((s.y + m * baseR) / (s.n + m), 0.05, 0.95);
      catLogitMap[cat] = Math.round((Math.log(p / (1 - p)) - baseLogit) * 10_000) / 10_000;
    }
  }
  const catLogit = (cat: string | undefined): number => {
    const k = cat ?? 'Uncategorized';
    return Object.prototype.hasOwnProperty.call(catLogitMap, k) ? catLogitMap[k]! : 0;
  };

  const feat = (p: StandalonePeer): number[] => {
    const v = [1];
    if (opts.useAge) v.push(Math.log(1 + p.age_filled));
    if (opts.useLegacy) v.push(p.legacy);
    if (opts.useCatShare) v.push(catLogit(p.category));
    if (opts.useSector) {
      for (let s = 0; s < 5; s++) v.push(p.sector === SECTORS[s] ? 1 : 0);
    }
    if (opts.useTvl) v.push(p.ltvl);
    if (opts.useG7d) v.push(p.g7d);
    if (opts.useChains) v.push(p.lch);
    if (opts.usePlacebo) v.push(p.placebo);
    return v;
  };

  const X = train.map(feat);
  const d = X[0]!.length;
  const coef = new Array<number>(d).fill(0);
  const lam = 1.5;

  for (let it = 0; it < 20; it++) {
    const H = Array.from({ length: d }, (_, i) =>
      Array.from({ length: d }, (_, j) => (i === j && i > 0 ? lam : 0)),
    );
    const g = new Array<number>(d).fill(0);
    for (let i = 0; i < train.length; i++) {
      const xi = X[i]!;
      let z = 0;
      for (let j = 0; j < d; j++) z += coef[j]! * xi[j]!;
      const pr = sigmoid(z);
      const w = Math.max(1e-6, pr * (1 - pr));
      const diff = train[i]!.y - pr;
      for (let j = 0; j < d; j++) {
        g[j]! += diff * xi[j]!;
        for (let k = 0; k < d; k++) H[j]![k]! += w * xi[j]! * xi[k]!;
      }
    }
    for (let j = 1; j < d; j++) g[j]! -= lam * coef[j]!;
    const step = solveLinear(H, g);
    for (let j = 0; j < d; j++) coef[j]! += step[j]!;
  }

  return {
    coef,
    catLogitMap,
    predict: (p: StandalonePeer) => {
      const x = feat(p);
      let z = 0;
      for (let j = 0; j < d; j++) z += coef[j]! * x[j]!;
      return sigmoid(z);
    },
  };
}

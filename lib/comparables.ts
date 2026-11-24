// Clean comparable-entity construction, 6-sector taxonomy, brand-verified symbol aggregation,
// and 25-iteration Huber IRLS fixed-effects TVL elasticity estimation.

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

/** Whole UTC days elapsed since `listedAt` at `asOf`, clamped at 0; null if missing/invalid. */
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

export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  const frac = pos - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return quantile(s, 0.5);
}

export function iqr(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const s = [...values].sort((a, b) => a - b);
  return Math.max(0, quantile(s, 0.75) - quantile(s, 0.25));
}

export function clamp(val: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, val));
}

/** Extract >= 3 char brand stems from slug, first name word, and gecko_id to prevent ticker collisions. */
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

/**
 * Build the clean comparable entity universe:
 * - Strictly requires `mcap_usd !== null && mcap_usd > 0` (rejects `autofinance: -1` and zeros)
 * - Excludes CEX / Bridge / Locker / Launchpad categories
 * - Aggregates TVL across brand-verified, same-sector, case-insensitive symbol siblings
 */
export function buildComparables(snapshot: Snapshot): {
  comparables: ComparableEntity[];
  core: ComparableEntity[];
} {
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
        // Only fold sibling deployments that do not carry their own positive mcap_usd
        if (q.mcap_usd !== null && q.mcap_usd > 0) continue;
        if (sectorOf(q.category) === sec && sharesBrandStem(p, q)) {
          aggTvl += q.tvl_usd;
          siblings += 1;
        }
      }
    }

    const ratio = p.mcap_usd / aggTvl;
    const is_core = ratio >= 0.005 && ratio <= 10.0;
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
      ratio,
      n_siblings: siblings,
      change_7d: p.change_7d,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      is_core,
    });
  }

  comparables.sort(
    (a, b) => b.mcap_usd - a.mcap_usd || b.tvl_usd - a.tvl_usd || compareCodeUnit(a.slug, b.slug),
  );
  const core = comparables.filter((c) => c.is_core);
  return { comparables, core };
}

/**
 * Fit within-category fixed-effects log(mcap) vs log(tvl) elasticity `beta`
 * via 25-iteration Huber IRLS (delta = 1.0) with weighted group demeaning, clamped to [0.65, 0.90].
 */
export function fitHuberFE(core: readonly ComparableEntity[]): number {
  const byCat = new Map<string, ComparableEntity[]>();
  for (const c of core) {
    const arr = byCat.get(c.category) ?? [];
    arr.push(c);
    byCat.set(c.category, arr);
  }

  interface FePoint {
    groupIdx: number;
    x: number;
    y: number;
    w: number;
  }

  const groups: ComparableEntity[][] = [];
  const points: FePoint[] = [];
  for (const [, arr] of [...byCat.entries()].sort((a, b) => compareCodeUnit(a[0], b[0]))) {
    if (arr.length < 2) continue;
    const groupIdx = groups.length;
    groups.push(arr);
    for (const c of arr) {
      points.push({
        groupIdx,
        x: Math.log(c.tvl_usd),
        y: Math.log(c.mcap_usd),
        w: 1,
      });
    }
  }

  if (points.length < 4) return 0.7433;

  let beta = 0.75;
  const delta = 1.0;

  for (let iter = 0; iter < 25; iter++) {
    const sumW = new Array<number>(groups.length).fill(0);
    const sumWX = new Array<number>(groups.length).fill(0);
    const sumWY = new Array<number>(groups.length).fill(0);

    for (const pt of points) {
      sumW[pt.groupIdx]! += pt.w;
      sumWX[pt.groupIdx]! += pt.w * pt.x;
      sumWY[pt.groupIdx]! += pt.w * pt.y;
    }

    const meanX = sumW.map((sw, g) => (sw > 0 ? sumWX[g]! / sw : 0));
    const meanY = sumW.map((sw, g) => (sw > 0 ? sumWY[g]! / sw : 0));

    let num = 0;
    let den = 0;
    for (const pt of points) {
      const dx = pt.x - meanX[pt.groupIdx]!;
      const dy = pt.y - meanY[pt.groupIdx]!;
      num += pt.w * dx * dy;
      den += pt.w * dx * dx;
    }

    if (den > 1e-12 && Number.isFinite(num / den)) {
      beta = num / den;
    }

    // Update Huber weights from within-group residuals
    for (const pt of points) {
      const dx = pt.x - meanX[pt.groupIdx]!;
      const dy = pt.y - meanY[pt.groupIdx]!;
      const resid = dy - beta * dx;
      const absR = Math.abs(resid);
      pt.w = absR <= delta ? 1.0 : delta / absR;
    }
  }

  return Number.isFinite(beta) ? clamp(Math.round(beta * 10_000) / 10_000, 0.65, 0.90) : 0.7433;
}

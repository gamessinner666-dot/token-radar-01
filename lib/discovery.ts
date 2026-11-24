// Deterministic 3-tier pre-token discovery and strict hygiene filter (zero hardcoded names).

import type { CandidateProtocol, DiscoveryResult, Snapshot, SnapshotProtocol } from './types.ts';

export const HYGIENE_EXCLUDED_CATEGORIES = new Set<string>([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Cross Chain Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Anchor BTC',
  'Decentralized BTC',
  'Stablecoin Wrapper',
]);

/** Matches spaced version suffixes (" V2", " v3", " 2.0") AND unspaced uppercase suffixes ("CommunityV3"). */
export const VERSIONED_NAME_RE = /(\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)|[A-Za-z]V\d+)$/;
export const WRAPPED_NAME_RE = /\b(wrapped|staked|staking)\b/i;
export const EXCHANGE_PREFIX_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

const GENERIC_BRAND_STEMS = new Set<string>([
  'open', 'defi', 'meta', 'hyper', 'liquid', 'chain', 'usd', 'btc', 'eth', 'sol',
  'core', 'zero', 'one', 'bit', 'super', 'yield', 'stake', 'swap', 'vault', 'money',
  'trade', 'base', 'prime', 'blue', 'star', 'iron', 'auto', 'multi', 'omni', 'poly',
  'inter', 'cross', 'crypto', 'digital', 'global', 'alpha', 'delta', 'gamma', 'sigma',
  'omega', 'smart', 'safe', 'fast', 'true', 'real', 'pure', 'gold', 'silver', 'token',
  'coin', 'block', 'hash', 'node', 'pool', 'farm', 'lend', 'bank', 'cash', 'fund',
  'mint', 'earn', 'pay', 'pro', 'max', 'top', 'new', 'all', 'the', 'web', 'net',
  'dao', 'dex', 'cex', 'nft', 'rwa', 'l2',
]);

/** A protocol records no token when all three token identifiers are null. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Build brand-stem -> tokenized symbol map from all 416 protocols that record any token field. */
function buildTokenizedStemMap(protocols: readonly SnapshotProtocol[]): Map<string, string> {
  const map = new Map<string, { symbol: string; hasMcap: boolean }>();
  for (const p of protocols) {
    if (isPreToken(p)) continue;
    const stem = p.slug.split('-')[0]?.toLowerCase() ?? '';
    if (stem.length < 3 || GENERIC_BRAND_STEMS.has(stem)) continue;
    const sym = (p.symbol ?? p.gecko_id ?? stem).toUpperCase();
    const hasMcap = p.mcap_usd !== null && p.mcap_usd > 0;
    const prev = map.get(stem);
    if (!prev || (!prev.hasMcap && hasMcap)) {
      map.set(stem, { symbol: sym, hasMcap });
    }
  }
  const out = new Map<string, string>();
  for (const [stem, info] of map.entries()) out.set(stem, info.symbol);
  return out;
}

function buildFlags(p: SnapshotProtocol, siblingSymbol: string | null): string[] {
  const flags: string[] = [];
  if (siblingSymbol !== null) {
    flags.push(`Tokenized Sibling: ${siblingSymbol}`);
  }
  if (p.listed_at === null) {
    flags.push('Missing listed_at (neutral 1.00 maturity)');
  }
  if (p.change_7d === null) {
    flags.push('Missing 7d TVL delta');
  } else if (p.change_7d > 200) {
    flags.push('Extreme 7d surge (>200%)');
  }
  if (p.chains.length === 1 && p.chains[0] === 'Bitcoin' && p.category === 'Payments') {
    flags.push('Bitcoin P2P / Infra (low token probability)');
  }
  if (
    p.category === 'RWA' ||
    p.category === 'CeDeFi' ||
    p.category === 'Crypto Card Issuer' ||
    (p.category === 'Payments' && !(p.chains.length === 1 && p.chains[0] === 'Bitcoin'))
  ) {
    flags.push('Custodial / KYC / CeDeFi disclosure');
  }
  if (p.category === 'Chain') {
    flags.push('Base L1/L2 chain infrastructure');
  }
  return flags;
}

/**
 * Partition snapshot into:
 * - Tier 1: Mandatory Watchlist (100% coverage)
 * - Tier 2: Large-Cap Expansion (>= floor_usd clean non-watchlist pre-token)
 * - Tier 3: Early Discovery (< floor_usd clean non-watchlist pre-token)
 */
export function discoverCandidates(snapshot: Snapshot): DiscoveryResult {
  const bySlug = new Map<string, SnapshotProtocol>(snapshot.protocols.map((p) => [p.slug, p]));
  const tokenizedStems = buildTokenizedStemMap(snapshot.protocols);
  const watchlistSet = new Set<string>(snapshot.watchlist);

  const candidates: CandidateProtocol[] = [];
  let tokenizedExcluded = 0;
  let rawPreToken = 0;
  let hygieneDropped = 0;
  let siblingDropped = 0;
  let watchlistCount = 0;
  let largeCapCount = 0;
  let earlyCount = 0;

  // Tier 1: Mandatory watchlist (unconditionally kept)
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (!p) continue;
    const stem = p.slug.split('-')[0]?.toLowerCase() ?? '';
    const siblingSymbol = tokenizedStems.get(stem) ?? null;
    candidates.push({
      protocol: p,
      tier: 'watchlist',
      flags: buildFlags(p, siblingSymbol),
      sibling_symbol: siblingSymbol,
    });
    watchlistCount += 1;
  }

  // Tiers 2 & 3: Clean pre-token expansion
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) {
      tokenizedExcluded += 1;
      continue;
    }
    rawPreToken += 1;
    if (watchlistSet.has(p.slug)) continue;

    const cat = p.category ?? '';
    if (
      HYGIENE_EXCLUDED_CATEGORIES.has(cat) ||
      VERSIONED_NAME_RE.test(p.name) ||
      WRAPPED_NAME_RE.test(p.name) ||
      EXCHANGE_PREFIX_RE.test(p.name)
    ) {
      hygieneDropped += 1;
      continue;
    }

    const stem = p.slug.split('-')[0]?.toLowerCase() ?? '';
    const siblingSymbol = tokenizedStems.get(stem) ?? null;
    if (siblingSymbol !== null) {
      siblingDropped += 1;
      continue;
    }

    const tier = p.tvl_usd >= snapshot.floor_usd ? 'large-cap' : 'early';
    if (tier === 'large-cap') largeCapCount += 1;
    else earlyCount += 1;

    candidates.push({
      protocol: p,
      tier,
      flags: buildFlags(p, null),
      sibling_symbol: null,
    });
  }

  return {
    candidates,
    counts: {
      total_protocols: snapshot.protocols.length,
      tokenized_excluded: tokenizedExcluded,
      raw_pre_token: rawPreToken,
      watchlist: watchlistCount,
      large_cap: largeCapCount,
      early: earlyCount,
      hygiene_dropped: hygieneDropped,
      sibling_dropped: siblingDropped,
    },
  };
}

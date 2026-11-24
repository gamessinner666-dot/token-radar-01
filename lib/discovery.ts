// Deterministic 3-tier discovery, strict hygiene filters, and MECE 758-protocol ledger accounting.

import { EXCLUDED_COMP_CATEGORIES } from './comparables.ts';
import type {
  CandidateProtocol,
  DiscoveryResult,
  LedgerBuckets,
  SetAsideItem,
  Snapshot,
  SnapshotProtocol,
} from './types.ts';

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

export const BRIDGE_CATEGORIES = new Set<string>(['Bridge', 'Canonical Bridge', 'Cross Chain Bridge']);
export const LST_BTC_CATEGORIES = new Set<string>([
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'Anchor BTC',
  'Decentralized BTC',
  'Stablecoin Wrapper',
]);

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

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isStandaloneForOdds(p: SnapshotProtocol): boolean {
  const cat = p.category ?? '';
  if (HYGIENE_EXCLUDED_CATEGORIES.has(cat)) return false;
  if (VERSIONED_NAME_RE.test(p.name) || WRAPPED_NAME_RE.test(p.name) || EXCHANGE_PREFIX_RE.test(p.name)) {
    return false;
  }
  return true;
}

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
  if (siblingSymbol !== null) flags.push(`Tokenized Sibling: ${siblingSymbol}`);
  if (p.listed_at === null) flags.push('Missing listed_at (median age prior)');
  if (p.change_7d === null) flags.push('Missing 7d TVL delta');
  else if (p.change_7d > 200) flags.push('Extreme 7d surge (>200%)');
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
  return flags;
}

export function discoverCandidates(
  snapshot: Snapshot,
  compSlugs: ReadonlySet<string>,
): DiscoveryResult {
  const bySlug = new Map<string, SnapshotProtocol>(snapshot.protocols.map((p) => [p.slug, p]));
  const tokenizedStems = buildTokenizedStemMap(snapshot.protocols);
  const watchlistSet = new Set<string>(snapshot.watchlist);

  const candidates: CandidateProtocol[] = [];
  const setAside: SetAsideItem[] = [];
  const ledger: LedgerBuckets = {
    total: snapshot.protocols.length,
    watchlist: 0,
    large_cap: 0,
    early: 0,
    priced_comps: 0,
    other_tokenized: 0,
    excl_bridges: 0,
    excl_lst_btc: 0,
    excl_cex_ver_sib: 0,
  };

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
    ledger.watchlist += 1;
  }

  for (const p of snapshot.protocols) {
    if (watchlistSet.has(p.slug)) continue;
    if (compSlugs.has(p.slug)) {
      ledger.priced_comps += 1;
      continue;
    }
    if (!isPreToken(p)) {
      ledger.other_tokenized += 1;
      continue;
    }

    const cat = p.category ?? '';
    if (BRIDGE_CATEGORIES.has(cat)) {
      ledger.excl_bridges += 1;
      setAside.push({ slug: p.slug, name: p.name, category: cat || 'Bridge', tvl_usd: p.tvl_usd, reason: 'Bridge / Chain infra' });
      continue;
    }
    if (LST_BTC_CATEGORIES.has(cat) || WRAPPED_NAME_RE.test(p.name)) {
      ledger.excl_lst_btc += 1;
      setAside.push({ slug: p.slug, name: p.name, category: cat || 'Uncategorized', tvl_usd: p.tvl_usd, reason: 'LST / Restaked / Wrapped BTC' });
      continue;
    }
    if (cat === 'CEX' || VERSIONED_NAME_RE.test(p.name) || EXCHANGE_PREFIX_RE.test(p.name)) {
      ledger.excl_cex_ver_sib += 1;
      setAside.push({ slug: p.slug, name: p.name, category: cat || 'Uncategorized', tvl_usd: p.tvl_usd, reason: cat === 'CEX' ? 'Centralized exchange' : 'Versioned / Exchange clone' });
      continue;
    }
    if (EXCLUDED_COMP_CATEGORIES.has(cat)) {
      ledger.excl_cex_ver_sib += 1;
      setAside.push({ slug: p.slug, name: p.name, category: cat, tvl_usd: p.tvl_usd, reason: 'Excluded infra category' });
      continue;
    }

    const stem = p.slug.split('-')[0]?.toLowerCase() ?? '';
    const sibSym = tokenizedStems.get(stem);
    if (sibSym !== undefined) {
      ledger.excl_cex_ver_sib += 1;
      setAside.push({ slug: p.slug, name: p.name, category: cat || 'Uncategorized', tvl_usd: p.tvl_usd, reason: `Tokenized sibling (${sibSym})` });
      continue;
    }

    const tier = p.tvl_usd >= snapshot.floor_usd ? 'large-cap' : 'early';
    if (tier === 'large-cap') ledger.large_cap += 1;
    else ledger.early += 1;

    candidates.push({
      protocol: p,
      tier,
      flags: buildFlags(p, null),
      sibling_symbol: null,
    });
  }

  setAside.sort((a, b) => b.tvl_usd - a.tvl_usd);
  return { candidates, ledger, set_aside: setAside };
}

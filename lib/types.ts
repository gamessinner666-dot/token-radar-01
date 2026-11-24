// Shared TypeScript interfaces for Token Radar 01 (Node 22 erasable TS, stdlib only).

/** The ten fields present on every protocol in DefiLlama's sealed snapshot. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** Sealed snapshot document read from /input/snapshot.json. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export type SectorName =
  | 'Credit & Stablecoins'
  | 'Staking, Restaking & Infra'
  | 'Yield, Basis & Farming'
  | 'Trading & Derivatives'
  | 'Asset Mgmt & Curators'
  | 'RWA, Payments & Insurance';

export interface ComparableEntity {
  slug: string;
  name: string;
  category: string;
  sector: SectorName;
  symbol: string;
  chains: string[];
  raw_tvl_usd: number;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
  n_siblings: number;
  change_7d: number | null;
  age_days: number | null;
  is_core: boolean;
}

export interface PeerSnippet {
  slug: string;
  name: string;
  category: string;
  mcap_usd: number;
  tvl_usd: number;
  ratio: number;
}

export interface SectorStat {
  n: number;
  log_k: number;
  iqr_log: number;
  med_ratio: number;
  p25_ratio: number;
  p75_ratio: number;
  med_7d: number;
  top_peers: PeerSnippet[];
}

export interface CategoryStat {
  n: number;
  sector: SectorName;
  log_k: number;
  iqr_log: number;
  med_ratio: number;
  med_7d: number;
  n_all: number;
  top_peers: PeerSnippet[];
}

export interface LoocvSummary {
  n: number;
  rmsle: number;
  mdale: number;
  med_mult_err: number;
  within_2x: number;
  within_3x: number;
  starter_rmsle: number;
  starter_mdale: number;
  starter_med_mult_err: number;
  starter_within_3x: number;
}

export interface ModelCalibration {
  model_version: 'radar-2';
  ref_tvl_usd: number;
  beta_huber: number;
  global_log_k: number;
  global_iqr_log: number;
  global_med_7d: number;
  growth_weight: number;
  growth_scale: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  k_sector: number;
  k_category: number;
  min_cat_peers: number;
  min_cat_7d: number;
  loocv: LoocvSummary;
  sector_stats: Record<SectorName, SectorStat>;
  category_stats: Record<string, CategoryStat>;
}

export type RowTier = 'watchlist' | 'large-cap' | 'early';

export type ChainFamily =
  | 'evm_l2'
  | 'eth_l1'
  | 'solana'
  | 'bitcoin'
  | 'btc_l2'
  | 'bittensor'
  | 'algorand'
  | 'cosmos_ibc'
  | 'xrpl_stellar'
  | 'alt_vm';

export interface FarmStep {
  action: string;
  cost: string;
  time: string;
}

export interface FarmMeta {
  best_chain: string;
  chain_family: ChainFamily;
  family_label: string;
  gas_tier: string;
  min_capital_usd: number;
  hold_days: number;
  cadence: string;
  risk_tags: string[];
  epistemic_tier: string;
}

export interface CandidateProtocol {
  protocol: SnapshotProtocol;
  tier: RowTier;
  flags: string[];
  sibling_symbol: string | null;
}

export interface DiscoveryResult {
  candidates: CandidateProtocol[];
  counts: {
    total_protocols: number;
    tokenized_excluded: number;
    raw_pre_token: number;
    watchlist: number;
    large_cap: number;
    early: number;
    hygiene_dropped: number;
    sibling_dropped: number;
  };
}

export interface BoardModelDetail {
  scale_tvl_usd: number;
  peer_multiple: number;
  peer_source: 'category' | 'sector';
  peer_n: number;
  peer_iqr_log: number;
  peer_med_7d: number;
  excess_7d: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  half_iqr: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  sector: SectorName;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'records-no-token';
  tier: RowTier;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  confidence_score: number;
  flags: string[];
  sibling_symbol: string | null;
  model: BoardModelDetail;
  farm_meta: FarmMeta;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  sector: SectorName;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  tier: RowTier;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  confidence_score: number;
  flags: string[];
  sibling_symbol: string | null;
  model: BoardModelDetail;
  farm_meta: FarmMeta;
}

export interface RadarSummary {
  total_protocols: number;
  tokenized_excluded: number;
  raw_pre_token: number;
  watchlist_size: number;
  large_cap_size: number;
  early_size: number;
  board_size: number;
  comparables_total: number;
  comparables_core: number;
  total_board_tvl_usd: number;
  total_implied_usd: number;
  median_implied_usd: number;
  distinct_chains: number;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: 'radar-2';
  calibration: ModelCalibration;
  summary: RadarSummary;
  rows: RadarRow[];
  live_comparables: ComparableEntity[];
}

// Shared TypeScript interfaces for Token Radar 01 radar-3 (Node 22 erasable TS, stdlib only).

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
  listed_at: string | null;
  loo_pred_usd: number;
  loo_miss: number;
  loo_dir: 'low' | 'high' | 'exact';
}

export interface LedgerBuckets {
  total: number;
  watchlist: number;
  large_cap: number;
  early: number;
  priced_comps: number;
  other_tokenized: number;
  excl_bridges: number;
  excl_lst_btc: number;
  excl_cex_ver_sib: number;
}

export interface AblationRow {
  step: string;
  loo_miss: number;
  wf_miss: number;
  loo_w3x: number;
  wf_w3x: number;
  status: 'baseline' | 'kept' | 'tested_not_kept' | 'control';
}

export interface OddsAblationRow {
  step: string;
  cv10_brier: number;
  cv10_acc: number;
  wf_brier: number;
  wf_acc: number;
  status: 'baseline' | 'kept' | 'tested_not_kept' | 'control';
}

export interface PriceModelParams {
  ref_tvl_usd: number;
  intercept: number;
  intercept_se: number;
  beta_tvl: number;
  beta_tvl_se: number;
  cat_ridge_k: number;
  cat_adj: Record<string, number>;
  cat_adj_min: number;
  cat_adj_max: number;
  q25_log: number;
  q75_log: number;
  q10_log: number;
  q90_log: number;
  wf_cutoff: string;
  n_comps: number;
  loo_miss: number;
  wf_miss: number;
  flat_loo_miss: number;
  flat_wf_miss: number;
  cov50_loo: number;
  cov50_wf: number;
  cov80_loo: number;
  cov80_wf: number;
  within3x_loo: number;
  within3x_wf: number;
  ablation: AblationRow[];
}

export interface OddsModelParams {
  intercept: number;
  beta_age: number;
  beta_age_se: number;
  beta_tvl: number;
  beta_tvl_se: number;
  beta_g7d: number;
  beta_g7d_se: number;
  beta_chains: number;
  median_age_years: number;
  max_age_years: number;
  global_med_7d: number;
  base_rate: number;
  n_peers: number;
  wf_cutoff: string;
  cv10_brier: number;
  cv10_acc: number;
  wf_brier: number;
  wf_acc: number;
  base_cv10_brier: number;
  base_wf_brier: number;
  ablation: OddsAblationRow[];
}

export interface ModelCalibration {
  model_version: 'radar-4';
  price_model: PriceModelParams;
  odds_model: OddsModelParams;
  snapshot_7d_p05: number;
  board_checksum: string;
  board_total_implied_usd: number;
  default_drop_share: number;
  default_horizon_weeks: number;
  tbill_apr: number;
  farm_hourly_hurdle: number;
  n_bootstrap: number;
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

export type FarmVerdict = 'FARM' | 'MARGINAL' | 'SKIP';

export interface FarmStepItem {
  phase: string;
  action: string;
  cost_usd: number;
  cost_label: string;
  minutes: number;
  time_label: string;
}

export interface FarmEconomics {
  best_chain: string;
  chain_family: ChainFamily;
  family_label: string;
  gas_tier: string;
  deposit_usd: number;
  drop_share: number;
  horizon_weeks: number;
  setup_fee_usd: number;
  weekly_fee_usd: number;
  exit_fee_usd: number;
  total_fees_usd: number;
  total_minutes: number;
  total_hours: number;
  modelled_drop_usd: number;
  net_of_fees_usd: number;
  tbill_hurdle_usd: number;
  net_per_hour: number;
  verdict: FarmVerdict;
  break_even_drop_share: number;
  break_even_odds: number;
  exit_tvl_usd: number;
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
  ledger: LedgerBuckets;
}

export interface BoardRow {
  rank: number;
  rank_low: number;
  rank_high: number;
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
  value_if_launched_usd: number;
  launch_odds: number;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  implied_p10_usd: number;
  implied_p90_usd: number;
  flags: string[];
  sibling_symbol: string | null;
  farm_econ: FarmEconomics;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  rank_low: number;
  rank_high: number;
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
  value_if_launched_usd: number;
  launch_odds: number;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  implied_p10_usd: number;
  implied_p90_usd: number;
  flags: string[];
  sibling_symbol: string | null;
  farm_econ: FarmEconomics;
}

export interface RadarSummary {
  total_protocols: number;
  board_size: number;
  watchlist_size: number;
  large_cap_size: number;
  early_size: number;
  comparables_total: number;
  farm_count: number;
  marginal_count: number;
  skip_count: number;
  total_board_tvl_usd: number;
  total_implied_usd: number;
  median_implied_usd: number;
  distinct_chains: number;
}

export interface RawCompPoint {
  slug: string;
  category: string;
  tvl_usd: number;
  mcap_usd: number;
}

export interface RawPeerPoint {
  slug: string;
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  y: 0 | 1;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: 'radar-4';
  ledger: LedgerBuckets;
  calibration: ModelCalibration;
  summary: RadarSummary;
  rows: RadarRow[];
  live_comparables: ComparableEntity[];
  raw_comps: RawCompPoint[];
  raw_peers: RawPeerPoint[];
}

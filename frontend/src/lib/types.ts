export interface MetricValue {
  value: number | null;
  percentile: number | null;
  rank: number | null;
}

export interface CompanyResult {
  company_id: number;
  ticker: string;
  exchange: string;
  country: string | null;
  company_name: string;
  sector: string | null;
  industry: string | null;
  metrics: Record<string, MetricValue>;
  composite_percentile: number | null;
  market_cap: number | null;
  fiscal_year: number | null;
}

export interface MetricFilter {
  min?: number;
  max?: number;
}

export interface ScreeningRequest {
  region: string;
  metrics: string[];
  filters?: Record<string, MetricFilter>;
  limit?: number;
  through_cycle_years?: number;
  min_years?: number;
  market_cap_min?: number;
  market_cap_max?: number;
  adv_usd_min?: number;
  adv_usd_max?: number;
  valuation_metric?: string;
  valuation_percentile_min?: number;
  valuation_percentile_max?: number;
  sectors?: string[];
  countries?: string[];
  momentum_period?: string;
  momentum_percentile_min?: number;
  momentum_percentile_max?: number;
}

export interface ScreeningResponse {
  results: CompanyResult[];
  total_companies: number;
  filtered_count: number;
  region: string;
  timestamp?: string;
}

export interface RegionInfo {
  id: string;
  name: string;
  description: string;
  exchanges: string[];
  countries: string[];
}

export interface MetricInfo {
  id: string;
  name: string;
  description: string;
  category: string;
}

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

// Correlation
export interface CorrelationRequest {
  tickers: string[];
  years?: number;
  start_date?: string;
  end_date?: string;
  label_mode?: string;
}

export interface CorrelationStatistics {
  mean_correlation: number;
  median_correlation: number;
  min_correlation: number;
  max_correlation: number;
  num_pairs: number;
  diversification_score?: number;
  effective_independent_bets?: number;
}

export interface CorrelationResponse {
  correlation_matrix: number[][];
  tickers: string[];
  company_names: Record<string, string>;
  dendrogram_image: string;
  cluster_assignments: number[];
  statistics: CorrelationStatistics;
  start_date: string;
  end_date: string;
  valid_tickers: string[];
  excluded_tickers: string[];
  num_trading_days: number;
}

// Base Rate
export interface BaseRateRequest {
  ticker: string;
  metric: string;
  peer_selection?: string;
  custom_peers?: string[];
  years?: number;
}

export interface PeerDistribution {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  std: number;
  company_percentile: number;
  histogram_bins: number[];
  histogram_counts: number[];
  total_data_points: number;
  raw_values: number[];
}

export interface HistoricalDataPoint {
  year: number;
  company_value: number | null;
  peer_avg: number;
  peer_median: number;
  peer_count: number;
}

export interface ProbabilityAnalysis {
  above_median: number;
  above_75th: number;
  above_90th: number;
  below_25th: number;
  below_10th: number;
}

export interface BaseRateResponse {
  company_name: string;
  ticker: string;
  sector: string | null;
  metric: string;
  metric_name: string;
  current_value: number | null;
  peer_distribution: PeerDistribution;
  historical_data: HistoricalDataPoint[];
  peer_companies: Array<{ ticker: string; name: string }>;
  probability_analysis: ProbabilityAnalysis;
  peer_selection_method: string;
  years_analyzed: number;
}

// Portfolio
export interface Portfolio {
  id: number;
  name: string;
  holdings: PortfolioHolding[];
  created_at?: string;
  updated_at?: string;
}

export interface PortfolioHolding {
  ticker: string;
  weight: number;
  shares?: number;
}

export interface PortfolioListItem {
  id: number;
  name: string;
  num_holdings: number;
  created_at?: string;
}

export interface BucketBreakdown {
  name: string;
  weight: number;
  count: number;
  tickers: string[];
  avg_pe?: number;
  avg_roe?: number;
  avg_net_margin?: number;
  avg_pb?: number;
}

export interface MetricSummary {
  ticker: string;
  company_name: string;
  weight: number;
  sector?: string;
  country?: string;
  market_cap_usd?: number;
  pe_ratio?: number;
  pb_ratio?: number;
  div_yield?: number;
  roe?: number;
  net_margin?: number;
  eps?: number;
  cape_ratio?: number;
  return_1m?: number;
  return_3m?: number;
  return_6m?: number;
  return_12m?: number;
  return_ytd?: number;
}

export interface BenchmarkBreakdown {
  name: string;
  portfolio_weight: number;
  benchmark_weight: number;
  active_weight: number;
}

export interface VisualizationResponse {
  holdings: MetricSummary[];
  sector_breakdown: BucketBreakdown[];
  country_breakdown: BucketBreakdown[];
  region_breakdown: BucketBreakdown[];
  market_cap_breakdown?: BucketBreakdown[];
  total_weight: number;
  num_holdings: number;
  weighted_pe?: number;
  weighted_pb?: number;
  weighted_div_yield?: number;
  weighted_roe?: number;
  weighted_net_margin?: number;
  weighted_cape?: number;
  top_10_weight: number;
  hhi: number;
  benchmark_sector: BenchmarkBreakdown[];
  benchmark_country: BenchmarkBreakdown[];
}

// Tags
export interface Tag {
  id: number;
  name: string;
  colour: string;
  tag_type: string;
  tickers: string[];
}

export interface TagBreakdown {
  name: string;
  weight: number;
  count: number;
  tickers: string[];
  colour: string;
  tag_type: string;
  weighted_pe: number | null;
  weighted_pb: number | null;
  weighted_roe: number | null;
  weighted_net_margin: number | null;
  weighted_cape: number | null;
  weighted_div_yield: number | null;
}

// Construction
export interface ConstructionHolding {
  ticker: string;
  current_weight: number;
  new_weight: number;
}

export interface HoldingImpact {
  ticker: string;
  company_name: string;
  sector?: string;
  country?: string;
  current_weight: number;
  new_weight: number;
  delta: number;
  pro_rata_weight?: number;
  alpha?: number;
  market_cap_usd?: number;
  pe_ratio?: number;
  pb_ratio?: number;
  roe?: number;
  net_margin?: number;
  cape_ratio?: number;
}

export interface BucketDelta {
  name: string;
  current_weight: number;
  new_weight: number;
  delta: number;
}

export interface ConstructionResponse {
  holdings: HoldingImpact[];
  sector_deltas: BucketDelta[];
  country_deltas: BucketDelta[];
  market_cap_deltas: BucketDelta[];
  current_total: number;
  new_total: number;
  num_additions: number;
  num_removals: number;
  num_changes: number;
  current_top10: number;
  new_top10: number;
  current_hhi: number;
  new_hhi: number;
  current_weighted_pe?: number;
  current_weighted_cape?: number;
  current_weighted_pb?: number;
  current_weighted_roe?: number;
  current_weighted_net_margin?: number;
  weighted_pe?: number;
  weighted_cape?: number;
  weighted_pb?: number;
  weighted_roe?: number;
  weighted_net_margin?: number;
}

// Momentum
export interface MomentumData {
  company_id: number;
  ticker: string;
  return_1m?: number;
  return_3m?: number;
  return_6m?: number;
  return_12m?: number;
  percentile_1m?: number;
  percentile_3m?: number;
  percentile_6m?: number;
  percentile_12m?: number;
}

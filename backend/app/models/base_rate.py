"""Pydantic models for base rate analysis."""

from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class BaseRateRequest(BaseModel):
    ticker: str = Field(..., description="Ticker in format SYMBOL.EXCHANGE")
    metric: str = Field(..., description="Metric to analyze (e.g., revenue_growth, roe)")
    peer_selection: str = Field(default="sector", description="'sector' or 'custom'")
    custom_peers: Optional[List[str]] = Field(default=None, description="Custom peer tickers")
    years: int = Field(default=10, ge=1, le=20)


class PeerDistribution(BaseModel):
    min: float
    q1: float
    median: float
    q3: float
    max: float
    mean: float
    std: float
    company_percentile: float
    histogram_bins: List[float]
    histogram_counts: List[int]
    winsorized_min: float
    winsorized_max: float
    total_data_points: int
    raw_values: List[float] = Field(default_factory=list, description="Raw peer values for frontend re-binning")


class HistoricalDataPoint(BaseModel):
    year: int
    company_value: Optional[float]
    peer_avg: float
    peer_median: float
    peer_count: int


class ProbabilityAnalysis(BaseModel):
    above_median: float
    above_75th: float
    above_90th: float
    below_25th: float
    below_10th: float


class BaseRateResponse(BaseModel):
    company_name: str
    ticker: str
    sector: Optional[str]
    metric: str
    metric_name: str
    current_value: Optional[float]
    peer_distribution: PeerDistribution
    historical_data: List[HistoricalDataPoint]
    peer_companies: List[Dict[str, str]]
    probability_analysis: ProbabilityAnalysis
    peer_selection_method: str
    years_analyzed: int

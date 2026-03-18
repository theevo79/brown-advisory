"""Pydantic models for heatmap API."""

from typing import Optional, List, Dict
from pydantic import BaseModel


class PortfolioHeatmapRequest(BaseModel):
    holdings: List[Dict]  # [{ticker, weight}]
    metric: str = "cape"
    through_cycle_years: int = 10
    min_years: int = 5
    momentum_period: Optional[str] = None  # "1m", "3m", "6m", "12m"


class HeatmapRequest(BaseModel):
    region: str
    metric: str = "cape"
    through_cycle_years: int = 5
    min_years: int = 3
    market_cap_min: Optional[float] = None
    market_cap_max: Optional[float] = None
    adv_usd_min: Optional[float] = None
    adv_usd_max: Optional[float] = None
    momentum_period: Optional[str] = None  # "1m", "3m", "6m", "12m"
    valuation_metric: Optional[str] = None
    valuation_percentile_min: Optional[float] = None
    valuation_percentile_max: Optional[float] = None
    weighting: str = "equal"  # "equal" or "market_cap"


class HeatmapCell(BaseModel):
    country: str
    sector: str
    avg_value: Optional[float] = None
    company_count: int = 0
    momentum_percentile: Optional[float] = None


class HeatmapResponse(BaseModel):
    countries: List[str]
    sectors: List[str]
    matrix: List[List[Optional[float]]]
    counts: List[List[int]]
    companies: dict
    metric: str
    total_companies: int
    momentum_matrix: Optional[List[List[Optional[float]]]] = None

"""Pydantic models for screening API."""

from typing import Optional, Dict, List
from pydantic import BaseModel, Field


class MetricFilter(BaseModel):
    min: Optional[float] = None
    max: Optional[float] = None


class ScreeningRequest(BaseModel):
    region: str
    metrics: List[str] = []
    filters: Optional[Dict[str, MetricFilter]] = {}
    market_cap_min: Optional[float] = None
    market_cap_max: Optional[float] = None
    adv_usd_min: Optional[float] = None
    adv_usd_max: Optional[float] = None
    limit: Optional[int] = 2000
    through_cycle_years: Optional[int] = 5
    min_years: Optional[int] = 3
    valuation_metric: Optional[str] = None
    valuation_percentile_min: Optional[float] = None
    valuation_percentile_max: Optional[float] = None
    sectors: Optional[List[str]] = None
    countries: Optional[List[str]] = None
    momentum_period: Optional[str] = None
    momentum_percentile_min: Optional[float] = None
    momentum_percentile_max: Optional[float] = None


class MetricValue(BaseModel):
    value: Optional[float] = None
    percentile: Optional[float] = None
    rank: Optional[int] = None


class CompanyResult(BaseModel):
    company_id: int
    ticker: str
    exchange: str
    country: Optional[str] = None
    company_name: str
    sector: Optional[str] = None
    industry: Optional[str] = None
    metrics: Dict[str, MetricValue] = {}
    composite_percentile: Optional[float] = None
    market_cap: Optional[float] = None
    fiscal_year: Optional[int] = None


class ScreeningResponse(BaseModel):
    results: List[CompanyResult]
    total_companies: int
    filtered_count: int
    region: str
    timestamp: str

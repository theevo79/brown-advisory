"""Pydantic models for portfolio visualizer."""

from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class Holding(BaseModel):
    ticker: str
    weight: float = Field(ge=0, le=100)
    shares: Optional[float] = None


class PortfolioCreateRequest(BaseModel):
    name: str
    holdings: List[Holding]


class PortfolioResponse(BaseModel):
    id: int
    name: str
    holdings: List[Holding]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PortfolioListItem(BaseModel):
    id: int
    name: str
    num_holdings: int
    created_at: Optional[str] = None


class VisualizeRequest(BaseModel):
    holdings: List[Holding]


class BucketBreakdown(BaseModel):
    name: str
    weight: float
    count: int
    tickers: List[str]
    avg_pe: Optional[float] = None
    avg_roe: Optional[float] = None
    avg_net_margin: Optional[float] = None
    avg_pb: Optional[float] = None


class MetricSummary(BaseModel):
    ticker: str
    company_name: str
    weight: float
    sector: Optional[str] = None
    country: Optional[str] = None
    market_cap_usd: Optional[float] = None
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    div_yield: Optional[float] = None
    roe: Optional[float] = None
    net_margin: Optional[float] = None
    eps: Optional[float] = None
    cape_ratio: Optional[float] = None


class TagResponse(BaseModel):
    id: int
    name: str
    colour: str
    tag_type: str = "General"
    tickers: List[str] = []


class VisualizationResponse(BaseModel):
    holdings: List[MetricSummary]
    sector_breakdown: List[BucketBreakdown]
    country_breakdown: List[BucketBreakdown]
    market_cap_breakdown: List[BucketBreakdown] = []
    total_weight: float
    num_holdings: int
    weighted_pe: Optional[float] = None
    weighted_pb: Optional[float] = None
    weighted_div_yield: Optional[float] = None
    weighted_roe: Optional[float] = None
    weighted_net_margin: Optional[float] = None
    weighted_cape: Optional[float] = None
    top_10_weight: float
    hhi: float

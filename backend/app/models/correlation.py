"""Pydantic models for correlation analysis."""

from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class CorrelationRequest(BaseModel):
    tickers: List[str] = Field(..., min_length=2, max_length=100)
    years: int = Field(default=5, ge=1, le=10)
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class CorrelationStatistics(BaseModel):
    mean_correlation: float
    median_correlation: float
    min_correlation: float
    max_correlation: float
    num_pairs: int


class CorrelationResponse(BaseModel):
    correlation_matrix: List[List[float]]
    tickers: List[str]
    company_names: Dict[str, str]
    dendrogram_image: str
    cluster_assignments: List[int]
    statistics: CorrelationStatistics
    start_date: str
    end_date: str
    valid_tickers: List[str]
    excluded_tickers: List[str]
    num_trading_days: int

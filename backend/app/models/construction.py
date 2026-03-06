"""Pydantic models for portfolio construction."""

from typing import List, Optional
from pydantic import BaseModel, Field


class ConstructionHolding(BaseModel):
    ticker: str
    current_weight: float = 0
    new_weight: float = 0


class ConstructionRequest(BaseModel):
    holdings: List[ConstructionHolding]
    target_cash: float = Field(default=0, ge=0, le=100)


class HoldingImpact(BaseModel):
    ticker: str
    company_name: str
    sector: Optional[str] = None
    country: Optional[str] = None
    current_weight: float
    new_weight: float
    delta: float


class BucketDelta(BaseModel):
    name: str
    current_weight: float
    new_weight: float
    delta: float


class ConstructionResponse(BaseModel):
    holdings: List[HoldingImpact]
    sector_deltas: List[BucketDelta]
    country_deltas: List[BucketDelta]
    current_total: float
    new_total: float
    num_additions: int
    num_removals: int
    num_changes: int
    current_top10: float
    new_top10: float
    current_hhi: float
    new_hhi: float

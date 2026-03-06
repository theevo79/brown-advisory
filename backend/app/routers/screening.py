"""Screening endpoints - stock screening with metrics and filters."""

from fastapi import APIRouter, HTTPException
from typing import Optional
from pydantic import BaseModel

from app.models.screening import ScreeningRequest
from app.services.screening_service import ScreeningService
from app.services.momentum_service import MomentumService

router = APIRouter()


class MomentumRequest(BaseModel):
    company_ids: list[int]
    period: str = "3m"


@router.post("/screen")
async def screen_stocks(request: ScreeningRequest):
    """Screen stocks based on region, metrics, and filters."""
    try:
        service = ScreeningService()
        response = service.screen_companies(request)
        service.close()
        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Screening error: {str(e)}")


@router.post("/momentum")
async def get_momentum(request: MomentumRequest):
    """Get momentum percentiles for a list of companies."""
    try:
        service = MomentumService()
        result = service.get_momentum_percentiles(request.company_ids, request.period)
        service.close()
        return {"data": result, "period": request.period, "count": len(result)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Momentum error: {str(e)}")


@router.post("/momentum/bulk")
async def get_bulk_momentum(request: MomentumRequest):
    """Get momentum for all periods at once."""
    try:
        service = MomentumService()
        result = service.get_bulk_momentum(request.company_ids)
        service.close()
        return {"data": result, "count": len(result)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Momentum error: {str(e)}")

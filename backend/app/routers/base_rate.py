"""Base Rate endpoints - peer comparison and distribution analysis."""

from fastapi import APIRouter, HTTPException
from app.models.base_rate import BaseRateRequest, BaseRateResponse
from app.services.base_rate_service import BaseRateService

router = APIRouter()


@router.post("/analyze", response_model=BaseRateResponse)
async def analyze_base_rate(request: BaseRateRequest):
    """Analyze base rates for a company against peers."""
    service = BaseRateService()
    try:
        result = service.analyze(request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Base rate error: {str(e)}")
    finally:
        service.close()

"""Correlation endpoints - correlation matrix and dendrogram."""

from fastapi import APIRouter, HTTPException
from app.models.correlation import CorrelationRequest, CorrelationResponse
from app.services.correlation_service import CorrelationService

router = APIRouter()


@router.post("/analyze", response_model=CorrelationResponse)
async def analyze_correlation(request: CorrelationRequest):
    """Analyze portfolio correlations and generate dendrogram."""
    service = CorrelationService()
    try:
        result = service.analyze_portfolio(request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Correlation error: {str(e)}")
    finally:
        service.close()

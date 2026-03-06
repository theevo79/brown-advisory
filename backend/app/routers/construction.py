"""Portfolio construction endpoints — impact analysis."""

from fastapi import APIRouter, HTTPException
from app.models.construction import ConstructionRequest, ConstructionResponse
from app.services.construction_service import ConstructionService

router = APIRouter()


@router.post("/analyze", response_model=ConstructionResponse)
async def analyze_construction(request: ConstructionRequest):
    """Analyze impact of portfolio changes."""
    service = ConstructionService()
    try:
        return service.analyze(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Construction error: {str(e)}")
    finally:
        service.close()

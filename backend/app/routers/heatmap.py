"""Heatmap endpoints - country x sector matrix with momentum overlay."""

from fastapi import APIRouter, HTTPException
from app.models.heatmap import HeatmapRequest
from app.models.screening import ScreeningRequest
from app.services.heatmap_service import HeatmapService
from app.services.momentum_service import MomentumService

router = APIRouter()


@router.post("/market")
async def get_market_heatmap(request: HeatmapRequest):
    """Generate country x sector heatmap with optional momentum overlay."""
    try:
        # Convert to screening request format
        screening_request = ScreeningRequest(
            region=request.region,
            metrics=[request.metric],
            through_cycle_years=request.through_cycle_years,
            min_years=request.min_years,
            market_cap_min=request.market_cap_min,
            market_cap_max=request.market_cap_max,
            adv_usd_min=request.adv_usd_min,
            limit=5000,
        )

        heatmap_service = HeatmapService()

        # If momentum period requested, calculate momentum data
        momentum_data = None
        if request.momentum_period:
            # First run screening to get company IDs
            from app.services.screening_service import ScreeningService
            screening_service = ScreeningService()
            screening_response = screening_service.screen_companies(screening_request)
            company_ids = [r.company_id for r in screening_response.results]
            screening_service.close()

            if company_ids:
                momentum_service = MomentumService()
                momentum_percentiles = momentum_service.get_momentum_percentiles(
                    company_ids, request.momentum_period
                )
                # Convert to company_id -> percentile map
                momentum_data = {
                    int(cid): data['percentile']
                    for cid, data in momentum_percentiles.items()
                }
                momentum_service.close()

        result = heatmap_service.get_market_heatmap(screening_request, momentum_data)
        heatmap_service.close()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Heatmap error: {str(e)}")

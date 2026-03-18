"""Heatmap endpoints - country x sector matrix with momentum overlay."""

from fastapi import APIRouter, HTTPException
from app.models.heatmap import HeatmapRequest, PortfolioHeatmapRequest
from app.models.screening import ScreeningRequest
from app.services.heatmap_service import HeatmapService, CORE_METRICS
from app.services.momentum_service import MomentumService

router = APIRouter()


@router.post("/market")
async def get_market_heatmap(request: HeatmapRequest):
    """Generate country x sector heatmap with optional momentum overlay."""
    try:
        # Build metrics list — include focus metric and core metrics for stock detail table
        metrics_list = [request.metric]
        for m in CORE_METRICS:
            if m not in metrics_list:
                metrics_list.append(m)
        if request.valuation_metric and request.valuation_metric not in metrics_list:
            metrics_list.append(request.valuation_metric)

        # Convert to screening request format
        screening_request = ScreeningRequest(
            region=request.region,
            metrics=metrics_list,
            through_cycle_years=request.through_cycle_years,
            min_years=request.min_years,
            market_cap_min=request.market_cap_min,
            market_cap_max=request.market_cap_max,
            adv_usd_min=request.adv_usd_min,
            limit=5000,
            valuation_metric=request.valuation_metric,
            valuation_percentile_min=request.valuation_percentile_min,
            valuation_percentile_max=request.valuation_percentile_max,
        )

        heatmap_service = HeatmapService()

        # Run screening ONCE and reuse results
        screening_response = heatmap_service.screening_service.screen_companies(screening_request)

        # If momentum period requested, calculate momentum data
        momentum_data = None
        if request.momentum_period:
            company_ids = [r.company_id for r in screening_response.results]
            if company_ids:
                momentum_service = MomentumService()
                momentum_percentiles = momentum_service.get_momentum_percentiles(
                    company_ids, request.momentum_period
                )
                momentum_data = {
                    int(cid): data['percentile']
                    for cid, data in momentum_percentiles.items()
                }
                momentum_service.close()

        result = heatmap_service.build_heatmap_from_results(
            screening_response, momentum_data,
            weighting=request.weighting, region=request.region
        )
        heatmap_service.close()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Heatmap error: {str(e)}")


@router.post("/portfolio")
async def get_portfolio_heatmap(request: PortfolioHeatmapRequest):
    """Generate heatmap from portfolio holdings."""
    try:
        heatmap_service = HeatmapService()
        result = heatmap_service.get_portfolio_heatmap(
            holdings=request.holdings,
            metric=request.metric,
            through_cycle_years=request.through_cycle_years,
            min_years=request.min_years,
        )

        # Calculate momentum if requested
        if request.momentum_period and result.get('stock_details'):
            company_ids = [
                c.get('company_id') for detail in result.get('companies', {}).values()
                for c in detail if c.get('company_id')
            ]
            # Deduplicate
            company_ids = list(set(cid for cid in company_ids if cid))
            if company_ids:
                momentum_service = MomentumService()
                momentum_percentiles = momentum_service.get_momentum_percentiles(
                    company_ids, request.momentum_period
                )
                momentum_service.close()

                # Attach momentum to companies map
                momentum_by_id = {
                    int(cid): data['percentile']
                    for cid, data in momentum_percentiles.items()
                }
                for key, companies in result.get('companies', {}).items():
                    for c in companies:
                        cid = c.get('company_id')
                        if cid and cid in momentum_by_id:
                            c['momentum'] = momentum_by_id[cid]

                # Build momentum matrix
                countries = result.get('countries', [])
                sectors = result.get('sectors', [])
                momentum_matrix = []
                for country in countries:
                    row = []
                    for sector in sectors:
                        cell_key = f"{country}_{sector}"
                        cell_companies = result['companies'].get(cell_key, [])
                        if cell_companies:
                            mom_vals = [c['momentum'] for c in cell_companies if c.get('momentum') is not None]
                            row.append(round(sum(mom_vals) / len(mom_vals), 1) if mom_vals else None)
                        else:
                            row.append(None)
                    momentum_matrix.append(row)
                result['momentum_matrix'] = momentum_matrix

        heatmap_service.close()
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Portfolio heatmap error: {str(e)}")

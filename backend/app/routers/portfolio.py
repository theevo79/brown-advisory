"""Portfolio endpoints - CRUD and visualization."""

from fastapi import APIRouter, HTTPException
from typing import List
from app.models.portfolio import (
    PortfolioCreateRequest, PortfolioResponse,
    PortfolioListItem, VisualizeRequest, VisualizationResponse
)
from app.services.portfolio_service import PortfolioService

router = APIRouter()


@router.post("/create", response_model=PortfolioResponse)
async def create_portfolio(request: PortfolioCreateRequest):
    service = PortfolioService()
    try:
        return service.create_portfolio(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        service.close()


@router.get("/list", response_model=List[PortfolioListItem])
async def list_portfolios():
    service = PortfolioService()
    try:
        return service.list_portfolios()
    finally:
        service.close()


@router.get("/{portfolio_id}", response_model=PortfolioResponse)
async def get_portfolio(portfolio_id: int):
    service = PortfolioService()
    try:
        return service.get_portfolio(portfolio_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        service.close()


@router.put("/{portfolio_id}", response_model=PortfolioResponse)
async def update_portfolio(portfolio_id: int, request: PortfolioCreateRequest):
    service = PortfolioService()
    try:
        return service.update_portfolio(portfolio_id, request)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    finally:
        service.close()


@router.delete("/{portfolio_id}")
async def delete_portfolio(portfolio_id: int):
    service = PortfolioService()
    try:
        service.delete_portfolio(portfolio_id)
        return {"status": "deleted"}
    finally:
        service.close()


@router.post("/visualize", response_model=VisualizationResponse)
async def visualize_portfolio(request: VisualizeRequest):
    service = PortfolioService()
    try:
        return service.visualize(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Visualization error: {str(e)}")
    finally:
        service.close()

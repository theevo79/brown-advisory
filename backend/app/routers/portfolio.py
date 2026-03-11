"""Portfolio endpoints - CRUD and visualization."""

from fastapi import APIRouter, HTTPException
from typing import List, Optional
from pydantic import BaseModel
from app.models.portfolio import (
    PortfolioCreateRequest, PortfolioResponse,
    PortfolioListItem, VisualizeRequest, VisualizationResponse,
    TagResponse
)
from app.services.portfolio_service import PortfolioService
from app.utils.app_database import get_app_db

router = APIRouter()


# --- Tag models ---
class TagCreateRequest(BaseModel):
    name: str
    colour: str = "#163963"
    tag_type: str = "General"

class TagAssignRequest(BaseModel):
    tickers: List[str]

class TagBreakdownItem(BaseModel):
    name: str
    colour: str
    weight: float
    count: int
    tickers: List[str]
    tag_type: str = "General"
    weighted_pe: Optional[float] = None
    weighted_pb: Optional[float] = None
    weighted_roe: Optional[float] = None
    weighted_net_margin: Optional[float] = None
    weighted_cape: Optional[float] = None
    weighted_div_yield: Optional[float] = None


# ---- Tag endpoints (MUST come before /{portfolio_id} to avoid route conflicts) ----

@router.get("/tags", response_model=List[TagResponse])
async def list_tags():
    db = get_app_db()
    tags = db.fetchall("SELECT id, name, colour, tag_type FROM tags ORDER BY tag_type, name")
    result = []
    for t in tags:
        tickers = db.fetchall("SELECT ticker FROM ticker_tags WHERE tag_id = ?", (t['id'],))
        result.append(TagResponse(
            id=t['id'], name=t['name'], colour=t['colour'],
            tag_type=t.get('tag_type', 'General'),
            tickers=[r['ticker'] for r in tickers]
        ))
    return result


@router.get("/tags/types")
async def list_tag_types():
    """Get distinct tag type names."""
    db = get_app_db()
    rows = db.fetchall("SELECT DISTINCT tag_type FROM tags ORDER BY tag_type")
    return [r['tag_type'] for r in rows]


@router.post("/tags", response_model=TagResponse)
async def create_tag(request: TagCreateRequest):
    db = get_app_db()
    try:
        tag_id = db.execute(
            "INSERT INTO tags (name, colour, tag_type) VALUES (?, ?, ?)",
            (request.name, request.colour, request.tag_type)
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Tag name already exists")
    return TagResponse(id=tag_id, name=request.name, colour=request.colour, tag_type=request.tag_type, tickers=[])


@router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: int):
    db = get_app_db()
    db.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
    return {"status": "deleted"}


@router.post("/tags/{tag_id}/assign")
async def assign_tickers_to_tag(tag_id: int, request: TagAssignRequest):
    db = get_app_db()
    tag = db.fetchone("SELECT id, tag_type FROM tags WHERE id = ?", (tag_id,))
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    tag_type = tag.get('tag_type', 'General')

    for ticker in request.tickers:
        # Enforce mutual exclusivity: remove ticker from other tags of the same tag_type
        sibling_tags = db.fetchall(
            "SELECT id FROM tags WHERE tag_type = ? AND id != ?", (tag_type, tag_id)
        )
        for sibling in sibling_tags:
            db.execute(
                "DELETE FROM ticker_tags WHERE tag_id = ? AND ticker = ?",
                (sibling['id'], ticker)
            )

        existing = db.fetchone(
            "SELECT id FROM ticker_tags WHERE tag_id = ? AND ticker = ?", (tag_id, ticker)
        )
        if not existing:
            db.execute("INSERT INTO ticker_tags (tag_id, ticker) VALUES (?, ?)", (tag_id, ticker))
    return {"status": "assigned", "count": len(request.tickers)}


@router.delete("/tags/{tag_id}/assign/{ticker:path}")
async def unassign_ticker_from_tag(tag_id: int, ticker: str):
    db = get_app_db()
    db.execute("DELETE FROM ticker_tags WHERE tag_id = ? AND ticker = ?", (tag_id, ticker))
    return {"status": "unassigned"}


@router.post("/tags/breakdown", response_model=List[TagBreakdownItem])
async def get_tag_breakdown(request: VisualizeRequest):
    """Get portfolio weight breakdown by tags with weighted metrics."""
    db = get_app_db()
    tags = db.fetchall("SELECT id, name, colour, tag_type FROM tags ORDER BY name")

    weight_by_ticker = {h.ticker: h.weight for h in request.holdings}

    # Fetch metrics for all tickers via PortfolioService
    service = PortfolioService()
    try:
        metrics_by_ticker = {}
        for h in request.holdings:
            if '.' not in h.ticker:
                continue
            symbol, exchange = h.ticker.split('.', 1)
            company = service.db.db.get_company(symbol, exchange)
            if not company:
                continue
            company_id = company['company_id']
            pe, pb, div_yield, roe, net_margin, market_cap, eps = service._get_company_metrics(company_id)
            cape = service._compute_cape(company_id, market_cap)
            from app.models.portfolio import MetricSummary
            metrics_by_ticker[h.ticker] = MetricSummary(
                ticker=h.ticker, company_name=h.ticker, weight=h.weight,
                pe_ratio=pe, pb_ratio=pb, div_yield=div_yield,
                roe=roe, net_margin=net_margin, eps=eps, cape_ratio=cape,
                market_cap_usd=market_cap,
            )
    finally:
        service.close()

    def _weighted_avg(tickers, attr):
        num = 0.0
        valid_w = 0.0
        for tk in tickers:
            m = metrics_by_ticker.get(tk)
            if m:
                val = getattr(m, attr, None)
                if val is not None:
                    num += weight_by_ticker[tk] * val
                    valid_w += weight_by_ticker[tk]
        if valid_w == 0:
            return None
        return round(num / valid_w, 2)

    result = []
    # Track tagged tickers per tag_type for per-theme "Untagged" buckets
    tagged_by_type: dict = {}  # tag_type -> set of tickers

    for t in tags:
        tt = t.get('tag_type', 'General')
        if tt not in tagged_by_type:
            tagged_by_type[tt] = set()

        tag_tickers = db.fetchall("SELECT ticker FROM ticker_tags WHERE tag_id = ?", (t['id'],))
        matched = [r['ticker'] for r in tag_tickers if r['ticker'] in weight_by_ticker]
        if matched:
            weight = sum(weight_by_ticker[tk] for tk in matched)
            result.append(TagBreakdownItem(
                name=t['name'], colour=t['colour'],
                tag_type=tt,
                weight=weight, count=len(matched), tickers=matched,
                weighted_pe=_weighted_avg(matched, 'pe_ratio'),
                weighted_pb=_weighted_avg(matched, 'pb_ratio'),
                weighted_roe=_weighted_avg(matched, 'roe'),
                weighted_net_margin=_weighted_avg(matched, 'net_margin'),
                weighted_cape=_weighted_avg(matched, 'cape_ratio'),
                weighted_div_yield=_weighted_avg(matched, 'div_yield'),
            ))
            tagged_by_type[tt].update(matched)

    # Add per-theme "Untagged" buckets
    for tt, tagged_set in tagged_by_type.items():
        untagged = [tk for tk in weight_by_ticker if tk not in tagged_set]
        if untagged:
            result.append(TagBreakdownItem(
                name="Untagged", colour="#94a3b8",
                tag_type=tt,
                weight=sum(weight_by_ticker[tk] for tk in untagged),
                count=len(untagged), tickers=untagged,
                weighted_pe=_weighted_avg(untagged, 'pe_ratio'),
                weighted_pb=_weighted_avg(untagged, 'pb_ratio'),
                weighted_roe=_weighted_avg(untagged, 'roe'),
                weighted_net_margin=_weighted_avg(untagged, 'net_margin'),
                weighted_cape=_weighted_avg(untagged, 'cape_ratio'),
                weighted_div_yield=_weighted_avg(untagged, 'div_yield'),
            ))

    result.sort(key=lambda x: (x.tag_type, -x.weight))
    return result


# ---- Portfolio CRUD endpoints ----

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

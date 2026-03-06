"""
Metadata endpoints - regions, metrics, company search.
"""

from fastapi import APIRouter, Query
from app.utils.database import get_db

router = APIRouter()

REGIONS = [
    {"id": "em_asia", "name": "EM Asia", "description": "Emerging Market Asia", "exchanges": ["SHG", "SHE", "TWSE", "KQ", "KO", "NSE", "BSE", "JK", "BK", "KLSE", "PSE", "HM"], "countries": ["China", "Taiwan", "South Korea", "India", "Indonesia", "Thailand", "Malaysia", "Philippines", "Vietnam"]},
    {"id": "em_latam", "name": "EM Latin America", "description": "Emerging Market Latin America", "exchanges": ["SA", "MX", "BA", "SN", "CL", "LIM"], "countries": ["Brazil", "Mexico", "Argentina", "Chile", "Colombia", "Peru"]},
    {"id": "em_emea", "name": "EM EMEA", "description": "Emerging Market Europe, Middle East & Africa", "exchanges": ["JSE", "IS", "WSE", "PSE", "BUD", "SR", "QA", "ADX", "DFM", "CA", "XNAI"], "countries": ["South Africa", "Turkey", "Poland", "Czech Republic", "Hungary", "Saudi Arabia", "Qatar", "UAE", "Egypt", "Nigeria"]},
    {"id": "dm_us", "name": "US", "description": "United States", "exchanges": ["US"], "countries": ["United States"]},
    {"id": "dm_europe", "name": "Europe (DM)", "description": "Developed Market Europe", "exchanges": ["LSE", "PA", "XETRA", "MC", "MI", "AS", "SW", "OL", "ST", "CO", "HE", "VX", "LIS", "AT", "IR"], "countries": ["United Kingdom", "France", "Germany", "Spain", "Italy", "Netherlands", "Switzerland", "Norway", "Sweden", "Denmark", "Finland", "Austria", "Belgium", "Portugal", "Ireland", "Greece"]},
    {"id": "dm_apac", "name": "Asia Pacific (DM)", "description": "Developed Market Asia Pacific", "exchanges": ["TSE", "AU", "HK", "SG"], "countries": ["Japan", "Australia", "Hong Kong", "Singapore"]},
    {"id": "global", "name": "Global", "description": "All markets", "exchanges": [], "countries": []},
]

METRICS = {
    "valuation": [
        {"id": "pe_ratio", "name": "P/E Ratio", "description": "Price to Earnings", "category": "valuation"},
        {"id": "pb_ratio", "name": "P/B Ratio", "description": "Price to Book", "category": "valuation"},
        {"id": "ps_ratio", "name": "P/S Ratio", "description": "Price to Sales", "category": "valuation"},
        {"id": "ev_ebitda", "name": "EV/EBITDA", "description": "Enterprise Value to EBITDA", "category": "valuation"},
        {"id": "ev_sales", "name": "EV/Sales", "description": "Enterprise Value to Sales", "category": "valuation"},
        {"id": "ev_ebit", "name": "EV/EBIT", "description": "Enterprise Value to EBIT", "category": "valuation"},
        {"id": "ev_fcf", "name": "EV/FCF", "description": "Enterprise Value to Free Cash Flow", "category": "valuation"},
    ],
    "through_cycle": [
        {"id": "cape", "name": "CAPE", "description": "Cyclically Adjusted P/E (nominal)", "category": "through_cycle"},
        {"id": "cape_real", "name": "CAPE (Real)", "description": "CAPE inflation-adjusted", "category": "through_cycle"},
        {"id": "ev_nopat_avg", "name": "EV/NOPAT Avg", "description": "EV / N-year avg NOPAT", "category": "through_cycle"},
        {"id": "ev_ebit_avg", "name": "EV/EBIT Avg", "description": "EV / N-year avg EBIT", "category": "through_cycle"},
    ],
    "profitability": [
        {"id": "roe", "name": "ROE", "description": "Return on Equity (%)", "category": "profitability"},
        {"id": "roa", "name": "ROA", "description": "Return on Assets (%)", "category": "profitability"},
        {"id": "ebit_margin", "name": "EBIT Margin", "description": "EBIT / Revenue (%)", "category": "profitability"},
        {"id": "net_margin", "name": "Net Margin", "description": "Net Income / Revenue (%)", "category": "profitability"},
    ],
    "financial_health": [
        {"id": "current_ratio", "name": "Current Ratio", "description": "Current Assets / Current Liabilities", "category": "financial_health"},
        {"id": "debt_to_equity", "name": "Debt/Equity", "description": "Total Liabilities / Equity", "category": "financial_health"},
    ],
}


@router.get("/regions")
async def get_regions():
    return {"regions": REGIONS}


@router.get("/metrics")
async def get_metrics():
    return {"metrics": METRICS}


@router.get("/search/companies")
async def search_companies(
    q: str = Query(..., min_length=1),
    limit: int = Query(50, ge=1, le=200)
):
    db = get_db()
    results = db.search_companies(q, limit=limit)
    return {"results": results, "count": len(results)}

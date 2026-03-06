"""Market data utilities for accessing the market_data table."""

from typing import Optional
from database.database_client import EODHDDatabase
from app.utils.currency_converter import convert_to_usd


def get_latest_market_cap(company_id: int, db: EODHDDatabase, company_country: Optional[str] = None) -> Optional[float]:
    """Get latest market cap in USD from market_data table."""
    try:
        result = db.fetchone("""
            SELECT market_cap, market_cap_usd, currency
            FROM market_data
            WHERE company_id = ?
            ORDER BY date DESC
            LIMIT 1
        """, (company_id,))

        if result:
            if result['market_cap_usd'] and result['market_cap_usd'] > 0:
                return float(result['market_cap_usd'])
            if result['market_cap'] and result['market_cap'] > 0:
                return convert_to_usd(float(result['market_cap']), company_country, result['currency'])
        return None
    except Exception as e:
        print(f"Error fetching market cap for company {company_id}: {e}")
        return None


def get_precalculated_ratio(company_id: int, db: EODHDDatabase, ratio_name: str) -> Optional[float]:
    """Get pre-calculated ratio from market_data table."""
    try:
        result = db.fetchone(f"""
            SELECT {ratio_name}
            FROM market_data
            WHERE company_id = ?
            ORDER BY date DESC
            LIMIT 1
        """, (company_id,))
        if result and result[ratio_name]:
            return float(result[ratio_name])
        return None
    except Exception as e:
        print(f"Error fetching {ratio_name} for company {company_id}: {e}")
        return None

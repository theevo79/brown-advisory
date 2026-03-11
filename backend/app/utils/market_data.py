"""Market data utilities for accessing the market_data table."""

from typing import Optional
from database.database_client import EODHDDatabase
from app.utils.currency_converter import convert_to_usd, normalize_currency, PENNY_CURRENCY_MAP


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
            mc = result['market_cap']
            mc_usd = result['market_cap_usd']
            currency = result['currency'] or ''

            # For penny currencies (GBX, ZAc), market_cap_usd from EODHD is often
            # unreliable (off by 100x). Detect by comparing: if mc_usd is >50x
            # smaller than mc, it's broken — compute from mc instead.
            if mc_usd and mc_usd > 0 and mc and mc > 0:
                ratio = mc / mc_usd
                if ratio > 50:
                    # mc_usd is broken — convert mc (which is in base currency)
                    return convert_to_usd(float(mc), company_country, currency)
                return float(mc_usd)
            if mc_usd and mc_usd > 0:
                return float(mc_usd)
            if mc and mc > 0:
                return convert_to_usd(float(mc), company_country, currency)
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

"""
Fetch EODHD data for BAIV International Value Select ETF holdings.

Downloads fundamentals + daily prices for any holdings not already in the shared DB.
Also creates the portfolio in the Brown Advisory app database.
"""

import os
import sys
import time
import requests
from pathlib import Path
from datetime import datetime, timedelta

# Add backend to path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

from database.database_client import EODHDDatabase

EODHD_API_KEY = os.getenv("EODHD_API_KEY")
EODHD_BASE_URL = "https://eodhistoricaldata.com/api"

# All BAIV holdings mapped to EODHD ticker.exchange format
# Format: (csv_ticker, eodhd_ticker, exchange, company_name, weight_pct, shares)
BAIV_HOLDINGS = [
    # Cash excluded — it's not a stock
    ("2670", "2670", "TSE", "ABC-MART INC", 2.18, 75200),
    ("ABN", "ABN", "AS", "ABN AMRO BANK NV", 1.50, 26508),
    ("ADEN", "ADEN", "SW", "ADECCO GROUP AG", 2.11, 44086),
    ("AGS", "AGS", "BR", "AGEAS SA/NV", 0.98, 7896),
    ("AIBG", "AIBG", "IR", "AIB GROUP PLC", 2.33, 127840),
    ("ABF", "ABF", "LSE", "ASSOCIATED BRITISH FOODS PLC", 1.99, 44368),
    ("AMV0", "AMV0", "XETRA", "AUMOVIO SE", 1.39, 17766),
    ("SAN", "SAN", "MC", "BANCO SANTANDER SA", 1.40, 70218),
    ("BIRG", "BIRG", "IR", "BANK OF IRELAND GROUP PLC", 1.42, 44932),
    ("BARC", "BARC", "LSE", "BARCLAYS PLC", 1.84, 189222),
    ("BAS", "BAS", "XETRA", "BASF SE", 1.54, 16356),
    ("BNP", "BNP", "PA", "BNP PARIBAS SA", 1.89, 10528),
    ("BNR", "BNR", "XETRA", "BRENNTAG SE", 2.20, 23406),
    ("BTI", "BTI", "US", "BRITISH AMERICAN TOBACCO ADR", 2.72, 26132),
    ("BLND", "BLND", "LSE", "BRITISH LAND CO PLC", 1.46, 159894),
    ("BT/A", "BT-A", "LSE", "BT GROUP PLC", 1.03, 207928),
    ("BRBY", "BRBY", "LSE", "BURBERRY GROUP PLC", 1.44, 54520),
    ("CON", "CON", "XETRA", "CONTINENTAL AG", 1.32, 9964),
    ("1878", "1878", "TSE", "DAITO TRUST CONSTRUCT CO LTD", 1.56, 37600),
    ("DSY", "DSY", "PA", "DASSAULT SYSTEMES SE", 1.68, 42958),
    ("DCC", "DCC", "LSE", "DCC PLC", 1.92, 16826),  # Use LSE (already in DB)
    ("4324", "4324", "TSE", "DENTSU GROUP INC", 1.87, 56400),
    ("EDEN", "EDEN", "PA", "EDENRED SE", 2.32, 59314),
    ("EVK", "EVK", "XETRA", "EVONIK INDUSTRIES AG", 1.42, 49632),
    ("FDJU", "FDJU", "PA", "FDJ UNITED", 2.12, 39856),
    ("FME", "FME", "XETRA", "FRESENIUS MEDICAL CARE AG", 2.41, 29328),
    ("GFC", "GFC", "PA", "GECINA SA", 1.49, 9776),
    ("HEN3", "HEN3", "XETRA", "HENKEL AG & CO KGAA", 2.31, 14852),
    ("ICLR", "ICLR", "US", "ICON PLC", 3.26, 16920),
    ("IMB", "IMB", "LSE", "IMPERIAL BRANDS PLC", 1.79, 23500),
    ("7182", "7182", "TSE", "JAPAN POST BANK CO LTD", 1.82, 56400),
    ("AD", "AD", "AS", "KONINKLIJKE AHOLD DELHAIZE NV", 2.06, 24158),
    ("LAND", "LAND", "LSE", "LAND SECURITIES GROUP PLC", 1.71, 116748),
    ("MICC", "MICC", "AS", "MAGNUM ICE CREAM CO NV", 3.22, 117500),
    ("8725", "8725", "TSE", "MS&AD INSURANCE GROUP HOLDINGS", 1.33, 28200),
    ("NICE", "NICE", "US", "NICE LTD ADR", 2.35, 10246),
    ("PBR/A", "PBR-A", "US", "PETROLEO BRASILEIRO SA PREF ADR", 1.67, 57528),
    ("PRU", "PRU", "LSE", "PRUDENTIAL PLC", 2.00, 78678),
    ("RBI", "RBI", "VI", "RAIFFEISEN BANK INTERNATIONAL AG", 1.88, 24158),
    ("RAND", "RAND", "AS", "RANDSTAD NV", 2.09, 37412),
    ("RNO", "RNO", "PA", "RENAULT SA", 1.36, 22936),
    ("REP", "REP", "MC", "REPSOL SA", 1.73, 40044),
    ("RICHT", "RICHT", "BUD", "RICHTER GEDEON NYRT", 1.94, 31866),
    ("SNY", "SNY", "US", "SANOFI ADR", 2.98, 37224),
    ("SW", "SW", "PA", "SODEXO SA", 1.97, 21056),
    ("8630", "8630", "TSE", "SOMPO HOLDINGS INC", 1.29, 18800),
    ("8309", "8309", "TSE", "SUMITOMO MITSUI TRUST GROUP", 2.23, 37600),
    ("9989", "9989", "TSE", "SUNDRUG CO LTD", 2.14, 47000),
    ("UHR", "UHR", "SW", "SWATCH GROUP AG", 1.33, 3384),
    ("TX", "TX", "US", "TERNIUM SA ADR", 1.44, 20492),
    ("VOD", "VOD", "LSE", "VODAFONE GROUP PLC", 1.95, 748804),
    ("WPP", "WPP", "LSE", "WPP PLC", 1.93, 304560),
    ("7272", "7272", "TSE", "YAMAHA MOTOR CO LTD", 1.48, 112800),
]


def _parse_field(value):
    """Convert EODHD field value to float or None."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
    return None


IS_FIELD_MAP = {
    'totalRevenue': 'total_revenue',
    'costOfRevenue': 'cost_of_revenue',
    'grossProfit': 'gross_profit',
    'ebitda': 'ebitda',
    'ebit': 'ebit',
    'operatingIncome': 'operating_income',
    'netIncome': 'net_income',
    'eps': 'eps',
    'epsdiluted': 'eps_diluted',
    'weightedAverageShsOut': 'weighted_average_shares_outstanding',
    'weightedAverageShsOutDil': 'weighted_average_shares_outstanding_dil',
}

BS_FIELD_MAP = {
    'cash': 'cash',
    'shortTermInvestments': 'short_term_investments',
    'totalCurrentAssets': 'total_current_assets',
    'propertyPlantEquipment': 'property_plant_equipment',
    'goodWill': 'goodwill',
    'totalAssets': 'total_assets',
    'accountsPayable': 'accounts_payable',
    'shortTermDebt': 'short_term_debt',
    'totalCurrentLiabilities': 'total_current_liabilities',
    'longTermDebt': 'long_term_debt',
    'totalLiab': 'total_liab',
    'commonStock': 'common_stock',
    'retainedEarnings': 'retained_earnings',
    'totalStockholderEquity': 'total_stockholder_equity',
}

CF_FIELD_MAP = {
    'netIncome': 'net_income',
    'depreciation': 'depreciation',
    'changeInWorkingCapital': 'change_in_working_capital',
    'totalCashFromOperatingActivities': 'total_cash_from_operating_activities',
    'capitalExpenditures': 'capital_expenditures',
    'totalCashflowsFromInvestingActivities': 'total_cashflows_from_investing_activities',
    'dividendsPaid': 'dividends_paid',
    'totalCashFromFinancingActivities': 'total_cash_from_financing_activities',
    'freeCashFlow': 'free_cash_flow',
}


def fetch_fundamentals(db: EODHDDatabase, ticker: str, exchange: str, name: str):
    """Fetch fundamentals from EODHD API and save to database."""
    symbol = f"{ticker}.{exchange}"
    url = f"{EODHD_BASE_URL}/fundamentals/{symbol}"
    params = {"api_token": EODHD_API_KEY, "fmt": "json"}

    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  [ERROR] API call failed for {symbol}: {e}")
        return None

    if not data or "General" not in data:
        print(f"  [WARN] No fundamental data for {symbol}")
        # Still create the company entry
        company_id = db.get_or_create_company(
            ticker=ticker, exchange_code=exchange, full_name=name
        )
        return company_id

    general = data.get("General", {})
    company_id = db.get_or_create_company(
        ticker=ticker,
        exchange_code=exchange,
        full_name=general.get("Name", name),
        sector=general.get("Sector"),
        industry=general.get("Industry"),
        country=general.get("Country"),
        currency=general.get("CurrencyCode"),
    )

    financials = data.get("Financials", {})

    # Income statements
    is_count = 0
    for date_key, stmt in financials.get("Income_Statement", {}).get("yearly", {}).items():
        try:
            fiscal_year = int(date_key[:4])
            stmt_data = {}
            for api_key, db_key in IS_FIELD_MAP.items():
                val = _parse_field(stmt.get(api_key))
                if val is not None:
                    stmt_data[db_key] = val
            if stmt_data:
                db.save_income_statement(company_id, fiscal_year, date_key, stmt_data)
                is_count += 1
        except Exception as e:
            print(f"    [ERROR] IS {date_key}: {e}")

    # Balance sheets
    bs_count = 0
    for date_key, stmt in financials.get("Balance_Sheet", {}).get("yearly", {}).items():
        try:
            fiscal_year = int(date_key[:4])
            stmt_data = {}
            for api_key, db_key in BS_FIELD_MAP.items():
                val = _parse_field(stmt.get(api_key))
                if val is not None:
                    stmt_data[db_key] = val
            if stmt_data:
                db.save_balance_sheet(company_id, fiscal_year, date_key, stmt_data)
                bs_count += 1
        except Exception as e:
            print(f"    [ERROR] BS {date_key}: {e}")

    # Cash flows
    cf_count = 0
    for date_key, stmt in financials.get("Cash_Flow", {}).get("yearly", {}).items():
        try:
            fiscal_year = int(date_key[:4])
            stmt_data = {}
            for api_key, db_key in CF_FIELD_MAP.items():
                val = _parse_field(stmt.get(api_key))
                if val is not None:
                    stmt_data[db_key] = val
            if stmt_data:
                db.save_cash_flow(company_id, fiscal_year, date_key, stmt_data)
                cf_count += 1
        except Exception as e:
            print(f"    [ERROR] CF {date_key}: {e}")

    # Update cache metadata
    cache_key = f"{ticker}_{exchange}_fundamentals"
    db.update_cache_metadata("FUNDAMENTALS", cache_key, expiry_days=7, company_id=company_id)

    print(f"  Saved fundamentals: {is_count} IS, {bs_count} BS, {cf_count} CF")
    return company_id


def fetch_prices(db: EODHDDatabase, ticker: str, exchange: str, company_id: int):
    """Fetch 5 years of daily prices from EODHD and save to database."""
    symbol = f"{ticker}.{exchange}"
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")

    url = f"{EODHD_BASE_URL}/eod/{symbol}"
    params = {
        "api_token": EODHD_API_KEY,
        "from": start_date,
        "to": end_date,
        "fmt": "json",
        "order": "d",
    }

    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"  [ERROR] Price API failed for {symbol}: {e}")
        return 0

    if not data or isinstance(data, dict):
        print(f"  [WARN] No price data for {symbol}")
        return 0

    count = 0
    for row in data:
        try:
            db.save_daily_price(
                company_id=company_id,
                trade_date=row["date"],
                open_price=row.get("open"),
                high_price=row.get("high"),
                low_price=row.get("low"),
                close_price=row.get("close"),
                adjusted_close=row.get("adjusted_close"),
                volume=row.get("volume"),
            )
            count += 1
        except Exception as e:
            pass  # Skip duplicate/error rows silently

    # Update cache metadata
    cache_key = f"{ticker}_{exchange}_prices"
    db.update_cache_metadata("PRICES", cache_key, expiry_days=1, company_id=company_id)

    print(f"  Saved {count} price records")
    return count


def create_portfolio(db_path: str):
    """Create the BAIV portfolio in the app database."""
    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")

    # Check if portfolio already exists
    existing = conn.execute(
        "SELECT id FROM portfolios WHERE name = ?",
        ("BA International Value Select ETF (BAIV)",)
    ).fetchone()

    if existing:
        portfolio_id = existing[0]
        # Clear existing holdings and re-insert
        conn.execute("DELETE FROM portfolio_holdings WHERE portfolio_id = ?", (portfolio_id,))
        print(f"Updating existing portfolio (id={portfolio_id})")
    else:
        cursor = conn.execute(
            "INSERT INTO portfolios (name, created_at, updated_at) VALUES (?, datetime('now'), datetime('now'))",
            ("BA International Value Select ETF (BAIV)",)
        )
        portfolio_id = cursor.lastrowid
        print(f"Created new portfolio (id={portfolio_id})")

    # Insert holdings (excluding cash)
    for csv_tick, eodhd_tick, exchange, name, weight, shares in BAIV_HOLDINGS:
        ticker_str = f"{eodhd_tick}.{exchange}"
        conn.execute(
            "INSERT INTO portfolio_holdings (portfolio_id, ticker, weight, shares) VALUES (?, ?, ?, ?)",
            (portfolio_id, ticker_str, weight, shares)
        )

    conn.commit()
    conn.close()
    print(f"Portfolio created with {len(BAIV_HOLDINGS)} holdings (id={portfolio_id})")
    return portfolio_id


def main():
    if not EODHD_API_KEY:
        print("ERROR: EODHD_API_KEY not set in .env")
        sys.exit(1)

    db = EODHDDatabase()

    # Determine which stocks need fetching
    missing = []
    existing = []
    for csv_tick, eodhd_tick, exchange, name, weight, shares in BAIV_HOLDINGS:
        company = db.get_company(eodhd_tick, exchange)
        if company:
            existing.append((eodhd_tick, exchange, company['company_id'], company.get('full_name', name)))
        else:
            missing.append((eodhd_tick, exchange, name, weight, shares))

    print(f"=== BAIV Holdings: {len(BAIV_HOLDINGS)} stocks ===")
    print(f"Already in DB: {len(existing)}")
    print(f"Need to fetch: {len(missing)}")
    print()

    # Fetch missing stocks
    if missing:
        print("=== Fetching missing stocks from EODHD API ===")
        for i, (ticker, exchange, name, weight, shares) in enumerate(missing, 1):
            print(f"\n[{i}/{len(missing)}] {ticker}.{exchange} ({name})")

            # Fetch fundamentals
            company_id = fetch_fundamentals(db, ticker, exchange, name)
            if company_id is None:
                print(f"  SKIPPED - could not create company entry")
                continue

            # Fetch prices
            fetch_prices(db, ticker, exchange, company_id)

            # Rate limit: ~2 requests per second (fundamentals + prices)
            if i < len(missing):
                time.sleep(1.0)

    # Also fetch prices for existing stocks that might have stale/missing price data
    print("\n=== Checking prices for existing stocks ===")
    for ticker, exchange, company_id, name in existing:
        # Check if we have recent prices
        prices = db.get_daily_prices(company_id, limit=1)
        if prices:
            latest = prices[0]['trade_date']
            days_old = (datetime.now() - datetime.strptime(latest, "%Y-%m-%d")).days
            if days_old <= 7:
                print(f"  {ticker}.{exchange} - prices up to date ({latest})")
                continue
            print(f"  {ticker}.{exchange} - prices stale ({latest}, {days_old} days old)")
        else:
            print(f"  {ticker}.{exchange} - no prices, fetching...")

        fetch_prices(db, ticker, exchange, company_id)
        time.sleep(0.5)

    # Create the portfolio
    print("\n=== Creating BAIV portfolio ===")
    app_db_path = str(BACKEND_DIR / "brown_advisory.db")
    create_portfolio(app_db_path)

    # Summary
    print("\n=== DONE ===")
    total_found = 0
    total_missing = 0
    for csv_tick, eodhd_tick, exchange, name, weight, shares in BAIV_HOLDINGS:
        company = db.get_company(eodhd_tick, exchange)
        if company:
            total_found += 1
        else:
            total_missing += 1
            print(f"  Still missing: {eodhd_tick}.{exchange} ({name})")

    print(f"\nFinal: {total_found}/{len(BAIV_HOLDINGS)} stocks in database")

    db.close()


if __name__ == "__main__":
    main()

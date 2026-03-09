"""Fix AIBG (use LSE instead of IR) and create Japanese stock entries."""

import os, sys, time, requests
from pathlib import Path
from datetime import datetime, timedelta

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")
from database.database_client import EODHDDatabase

EODHD_API_KEY = os.getenv("EODHD_API_KEY")
EODHD_BASE_URL = "https://eodhistoricaldata.com/api"
db = EODHDDatabase()


def _parse_field(value):
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


IS_MAP = {
    "totalRevenue": "total_revenue", "costOfRevenue": "cost_of_revenue",
    "grossProfit": "gross_profit", "ebitda": "ebitda", "ebit": "ebit",
    "operatingIncome": "operating_income", "netIncome": "net_income",
    "eps": "eps", "epsdiluted": "eps_diluted",
    "weightedAverageShsOut": "weighted_average_shares_outstanding",
    "weightedAverageShsOutDil": "weighted_average_shares_outstanding_dil",
}
BS_MAP = {
    "cash": "cash", "shortTermInvestments": "short_term_investments",
    "totalCurrentAssets": "total_current_assets",
    "propertyPlantEquipment": "property_plant_equipment",
    "goodWill": "goodwill", "totalAssets": "total_assets",
    "accountsPayable": "accounts_payable", "shortTermDebt": "short_term_debt",
    "totalCurrentLiabilities": "total_current_liabilities",
    "longTermDebt": "long_term_debt", "totalLiab": "total_liab",
    "commonStock": "common_stock", "retainedEarnings": "retained_earnings",
    "totalStockholderEquity": "total_stockholder_equity",
}
CF_MAP = {
    "netIncome": "net_income", "depreciation": "depreciation",
    "changeInWorkingCapital": "change_in_working_capital",
    "totalCashFromOperatingActivities": "total_cash_from_operating_activities",
    "capitalExpenditures": "capital_expenditures",
    "totalCashflowsFromInvestingActivities": "total_cashflows_from_investing_activities",
    "dividendsPaid": "dividends_paid",
    "totalCashFromFinancingActivities": "total_cash_from_financing_activities",
    "freeCashFlow": "free_cash_flow",
}


def fetch_and_save(ticker, exchange, fallback_name, fallback_country=None):
    """Fetch fundamentals + prices for a stock and save to DB."""
    symbol = f"{ticker}.{exchange}"
    print(f"  Fetching {symbol}...")

    # Fundamentals
    resp = requests.get(
        f"{EODHD_BASE_URL}/fundamentals/{symbol}",
        params={"api_token": EODHD_API_KEY, "fmt": "json"}, timeout=30
    )
    data = resp.json()
    general = data.get("General", {})

    company_id = db.get_or_create_company(
        ticker, exchange,
        full_name=general.get("Name", fallback_name),
        sector=general.get("Sector"),
        industry=general.get("Industry"),
        country=fallback_country or general.get("Country"),
        currency=general.get("CurrencyCode"),
    )

    financials = data.get("Financials", {})

    is_count = bs_count = cf_count = 0
    for date_key, stmt in financials.get("Income_Statement", {}).get("yearly", {}).items():
        fy = int(date_key[:4])
        sd = {}
        for api_k, db_k in IS_MAP.items():
            v = _parse_field(stmt.get(api_k))
            if v is not None:
                sd[db_k] = v
        if sd:
            db.save_income_statement(company_id, fy, date_key, sd)
            is_count += 1

    for date_key, stmt in financials.get("Balance_Sheet", {}).get("yearly", {}).items():
        fy = int(date_key[:4])
        sd = {}
        for api_k, db_k in BS_MAP.items():
            v = _parse_field(stmt.get(api_k))
            if v is not None:
                sd[db_k] = v
        if sd:
            db.save_balance_sheet(company_id, fy, date_key, sd)
            bs_count += 1

    for date_key, stmt in financials.get("Cash_Flow", {}).get("yearly", {}).items():
        fy = int(date_key[:4])
        sd = {}
        for api_k, db_k in CF_MAP.items():
            v = _parse_field(stmt.get(api_k))
            if v is not None:
                sd[db_k] = v
        if sd:
            db.save_cash_flow(company_id, fy, date_key, sd)
            cf_count += 1

    print(f"    Fundamentals: {is_count} IS, {bs_count} BS, {cf_count} CF")

    # Prices
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")
    resp = requests.get(
        f"{EODHD_BASE_URL}/eod/{symbol}",
        params={"api_token": EODHD_API_KEY, "from": start_date, "to": end_date, "fmt": "json"},
        timeout=30
    )
    prices = resp.json()
    if isinstance(prices, list):
        for row in prices:
            db.save_daily_price(
                company_id, row["date"], row.get("open"), row.get("high"),
                row.get("low"), row.get("close"), row.get("adjusted_close"), row.get("volume")
            )
        print(f"    Prices: {len(prices)} records")
    else:
        print(f"    Prices: none available")

    return company_id


def main():
    import sqlite3

    # 1. Fix AIBG: delete IR entry, fetch LSE data
    print("=== Fixing AIBG: using LSE instead of IR ===")
    existing_ir = db.get_company("AIBG", "IR")
    if existing_ir:
        cid = existing_ir["company_id"]
        for table in ["income_statements", "balance_sheets", "cash_flows", "daily_prices", "api_cache_metadata"]:
            db.execute(f"DELETE FROM {table} WHERE company_id = ?", (cid,))
        db.execute("DELETE FROM companies WHERE company_id = ?", (cid,))
        print(f"  Deleted empty AIBG.IR (id={cid})")

    fetch_and_save("AIBG", "LSE", "AIB Group PLC", "Ireland")
    time.sleep(1)

    # 2. Create manual entries for Japanese stocks
    print("\n=== Creating manual entries for Japanese stocks ===")
    jp_stocks = [
        ("2670", "TSE", "ABC-MART INC", "Consumer Cyclical", "Specialty Retail", "Japan", "JPY"),
        ("1878", "TSE", "DAITO TRUST CONSTRUCT CO LTD", "Real Estate", "Real Estate Services", "Japan", "JPY"),
        ("4324", "TSE", "DENTSU GROUP INC", "Communication Services", "Advertising Agencies", "Japan", "JPY"),
        ("7182", "TSE", "JAPAN POST BANK CO LTD", "Financial Services", "Banks - Regional", "Japan", "JPY"),
        ("8725", "TSE", "MS&AD INSURANCE GROUP HOLDINGS", "Financial Services", "Insurance - Diversified", "Japan", "JPY"),
        ("8630", "TSE", "SOMPO HOLDINGS INC", "Financial Services", "Insurance - Property & Casualty", "Japan", "JPY"),
        ("8309", "TSE", "SUMITOMO MITSUI TRUST GROUP", "Financial Services", "Banks - Regional", "Japan", "JPY"),
        ("9989", "TSE", "SUNDRUG CO LTD", "Healthcare", "Pharmaceutical Retailers", "Japan", "JPY"),
        ("7272", "TSE", "YAMAHA MOTOR CO LTD", "Consumer Cyclical", "Recreational Vehicles", "Japan", "JPY"),
    ]

    for ticker, exchange, name, sector, industry, country, currency in jp_stocks:
        cid = db.get_or_create_company(
            ticker, exchange, full_name=name, sector=sector,
            industry=industry, country=country, currency=currency
        )
        print(f"  {ticker}.{exchange} -> id={cid} ({name})")

    # 3. Update portfolio: AIBG.IR -> AIBG.LSE
    print("\n=== Updating portfolio: AIBG.IR -> AIBG.LSE ===")
    app_db_path = str(BACKEND_DIR / "brown_advisory.db")
    conn = sqlite3.connect(app_db_path)
    conn.execute("UPDATE portfolio_holdings SET ticker = 'AIBG.LSE' WHERE ticker = 'AIBG.IR'")
    conn.commit()
    updated = conn.execute("SELECT COUNT(*) FROM portfolio_holdings WHERE ticker = 'AIBG.LSE'").fetchone()[0]
    print(f"  Updated {updated} holding(s)")
    conn.close()

    # 4. Final verification
    print("\n=== Final verification ===")
    all_tickers = [
        ("2670", "TSE"), ("ABN", "AS"), ("ADEN", "SW"), ("AGS", "BR"), ("AIBG", "LSE"),
        ("ABF", "LSE"), ("AMV0", "XETRA"), ("SAN", "MC"), ("BIRG", "IR"), ("BARC", "LSE"),
        ("BAS", "XETRA"), ("BNP", "PA"), ("BNR", "XETRA"), ("BTI", "US"), ("BLND", "LSE"),
        ("BT-A", "LSE"), ("BRBY", "LSE"), ("CON", "XETRA"), ("1878", "TSE"), ("DSY", "PA"),
        ("DCC", "LSE"), ("4324", "TSE"), ("EDEN", "PA"), ("EVK", "XETRA"), ("FDJU", "PA"),
        ("FME", "XETRA"), ("GFC", "PA"), ("HEN3", "XETRA"), ("ICLR", "US"), ("IMB", "LSE"),
        ("7182", "TSE"), ("AD", "AS"), ("LAND", "LSE"), ("MICC", "AS"), ("8725", "TSE"),
        ("NICE", "US"), ("PBR-A", "US"), ("PRU", "LSE"), ("RBI", "VI"), ("RAND", "AS"),
        ("RNO", "PA"), ("REP", "MC"), ("RICHT", "BUD"), ("SNY", "US"), ("SW", "PA"),
        ("8630", "TSE"), ("8309", "TSE"), ("9989", "TSE"), ("UHR", "SW"), ("TX", "US"),
        ("VOD", "LSE"), ("WPP", "LSE"), ("7272", "TSE"),
    ]

    found = missing = 0
    for t, e in all_tickers:
        c = db.get_company(t, e)
        if c:
            found += 1
        else:
            missing += 1
            print(f"  MISSING: {t}.{e}")

    print(f"\n{found}/{len(all_tickers)} stocks in database ({missing} missing)")
    db.close()


if __name__ == "__main__":
    main()

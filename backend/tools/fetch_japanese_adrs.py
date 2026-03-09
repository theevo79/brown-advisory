"""
Fetch fundamentals for Japanese BAIV holdings via their ADR/Frankfurt listings.
EODHD doesn't have a Tokyo Stock Exchange, but the same companies are available
via US ADRs or Frankfurt. We fetch from those and copy data to the TSE entries.
"""

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


# Mapping: (TSE ticker, ADR ticker, ADR exchange, company name)
JP_ADR_MAP = [
    ("2670", "5B8", "F", "ABC-MART INC"),
    ("1878", "DIFTY", "US", "DAITO TRUST CONSTRUCT CO LTD"),
    ("4324", "DNTUY", "US", "DENTSU GROUP INC"),
    ("7182", "JPPTY", "US", "JAPAN POST BANK CO LTD"),
    ("8725", "MSADY", "US", "MS&AD INSURANCE GROUP HOLDINGS"),
    ("8630", "SMPNY", "US", "SOMPO HOLDINGS INC"),
    ("8309", "SUTNY", "US", "SUMITOMO MITSUI TRUST GROUP"),
    ("7272", "YMHAY", "US", "YAMAHA MOTOR CO LTD"),
    # Sundrug (9989) - no ADR or Frankfurt listing found
]


def fetch_and_copy(tse_ticker, adr_ticker, adr_exchange, name):
    """Fetch fundamentals from ADR listing and save to the TSE company entry."""
    # Get the TSE company_id
    tse_company = db.get_company(tse_ticker, "TSE")
    if not tse_company:
        print(f"  ERROR: {tse_ticker}.TSE not in database")
        return

    tse_id = tse_company["company_id"]
    symbol = f"{adr_ticker}.{adr_exchange}"

    # Fetch fundamentals from ADR
    print(f"  Fetching {symbol}...")
    resp = requests.get(
        f"{EODHD_BASE_URL}/fundamentals/{symbol}",
        params={"api_token": EODHD_API_KEY, "fmt": "json"}, timeout=30
    )
    data = resp.json()

    if "General" not in data:
        print(f"  WARN: No fundamental data from {symbol}")
        return

    general = data.get("General", {})

    # Update company metadata from the ADR data
    db.update_company(
        tse_id,
        sector=general.get("Sector") or tse_company.get("sector"),
        industry=general.get("Industry") or tse_company.get("industry"),
        country="Japan",
        currency="JPY",
    )

    financials = data.get("Financials", {})

    # Save financial statements under the TSE company_id
    is_count = bs_count = cf_count = 0

    for date_key, stmt in financials.get("Income_Statement", {}).get("yearly", {}).items():
        try:
            fy = int(date_key[:4])
            sd = {}
            for api_k, db_k in IS_MAP.items():
                v = _parse_field(stmt.get(api_k))
                if v is not None:
                    sd[db_k] = v
            if sd:
                db.save_income_statement(tse_id, fy, date_key, sd)
                is_count += 1
        except Exception as e:
            print(f"    IS error {date_key}: {e}")

    for date_key, stmt in financials.get("Balance_Sheet", {}).get("yearly", {}).items():
        try:
            fy = int(date_key[:4])
            sd = {}
            for api_k, db_k in BS_MAP.items():
                v = _parse_field(stmt.get(api_k))
                if v is not None:
                    sd[db_k] = v
            if sd:
                db.save_balance_sheet(tse_id, fy, date_key, sd)
                bs_count += 1
        except Exception as e:
            print(f"    BS error {date_key}: {e}")

    for date_key, stmt in financials.get("Cash_Flow", {}).get("yearly", {}).items():
        try:
            fy = int(date_key[:4])
            sd = {}
            for api_k, db_k in CF_MAP.items():
                v = _parse_field(stmt.get(api_k))
                if v is not None:
                    sd[db_k] = v
            if sd:
                db.save_cash_flow(tse_id, fy, date_key, sd)
                cf_count += 1
        except Exception as e:
            print(f"    CF error {date_key}: {e}")

    print(f"  Saved to {tse_ticker}.TSE (id={tse_id}): {is_count} IS, {bs_count} BS, {cf_count} CF")

    # Also fetch prices from the ADR listing
    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=5 * 365)).strftime("%Y-%m-%d")
    resp = requests.get(
        f"{EODHD_BASE_URL}/eod/{symbol}",
        params={"api_token": EODHD_API_KEY, "from": start_date, "to": end_date, "fmt": "json"},
        timeout=30
    )
    prices = resp.json()
    if isinstance(prices, list) and len(prices) > 0:
        for row in prices:
            db.save_daily_price(
                tse_id, row["date"], row.get("open"), row.get("high"),
                row.get("low"), row.get("close"), row.get("adjusted_close"), row.get("volume")
            )
        print(f"  Prices: {len(prices)} records (from {symbol})")
    else:
        print(f"  Prices: none from {symbol}")


def main():
    print("=== Fetching Japanese stock data via ADR/Frankfurt listings ===\n")

    for i, (tse_tick, adr_tick, adr_exch, name) in enumerate(JP_ADR_MAP, 1):
        print(f"[{i}/{len(JP_ADR_MAP)}] {tse_tick}.TSE ({name}) via {adr_tick}.{adr_exch}")
        fetch_and_copy(tse_tick, adr_tick, adr_exch, name)
        if i < len(JP_ADR_MAP):
            time.sleep(1.0)
        print()

    # Verify
    print("=== Verification ===")
    jp_tickers = ["2670", "1878", "4324", "7182", "8725", "8630", "8309", "9989", "7272"]
    for t in jp_tickers:
        c = db.get_company(t, "TSE")
        if c:
            cid = c["company_id"]
            is_rows = db.get_income_statements(cid, limit=1)
            prices = db.get_daily_prices(cid, limit=1)
            has_is = "yes" if is_rows else "no"
            has_px = "yes" if prices else "no"
            print(f"  {t}.TSE (id={cid}): fundamentals={has_is}, prices={has_px}, sector={c.get('sector', '?')}")

    db.close()


if __name__ == "__main__":
    main()

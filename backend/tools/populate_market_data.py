"""
Populate market_data table for BAIV holdings that are missing entries.
Fetches from EODHD /fundamentals/ endpoint to get MarketCap, PE, PB, EPS.
For Japanese stocks, uses ADR/Frankfurt ticker mappings.
"""

import os, sys, time, requests
from pathlib import Path
from datetime import datetime

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

import sqlite3

EODHD_API_KEY = os.getenv("EODHD_API_KEY")
EODHD_BASE_URL = "https://eodhistoricaldata.com/api"
DB_PATH = os.getenv("DATABASE_PATH", str(BACKEND_DIR / "data" / "eodhd_data.db"))

# Japanese stocks -> ADR/Frankfurt mapping
JP_ADR_MAP = {
    "2670": ("5B8", "F"),
    "1878": ("DIFTY", "US"),
    "4324": ("DNTUY", "US"),
    "7182": ("JPPTY", "US"),
    "8725": ("MSADY", "US"),
    "8630": ("SMPNY", "US"),
    "8309": ("SUTNY", "US"),
    "7272": ("YMHAY", "US"),
    # 9989 (Sundrug) has no ADR
}

# All 28 missing tickers with their company_ids
MISSING_STOCKS = [
    ("2670", "TSE", 15388),
    ("ADEN", "SW", 15368),
    ("AIBG", "LSE", 15387),
    ("ABF", "LSE", 15370),
    ("AMV0", "XETRA", 15371),
    ("BIRG", "IR", 15372),
    ("BTI", "US", 15373),
    ("BLND", "LSE", 15374),
    ("1878", "TSE", 15389),
    ("4324", "TSE", 15390),
    ("EDEN", "PA", 15375),
    ("EVK", "XETRA", 15376),
    ("FDJU", "PA", 15377),
    ("GFC", "PA", 15378),
    ("ICLR", "US", 15379),
    ("7182", "TSE", 15391),
    ("MICC", "AS", 15380),
    ("8725", "TSE", 15392),
    ("NICE", "US", 15381),
    ("PBR-A", "US", 15382),
    ("RICHT", "BUD", 15383),
    ("SNY", "US", 15384),
    ("SW", "PA", 15385),
    ("8630", "TSE", 15393),
    ("8309", "TSE", 15394),
    ("9989", "TSE", 15395),
    ("UHR", "SW", 15386),
    ("7272", "TSE", 15396),
]

# FX rates for USD conversion (approximate)
FX_RATES = {
    "USD": 1.0,
    "GBP": 1.0,  # LSE prices already in GBp (pence), market_cap from API is in native currency
    "EUR": 1.087,
    "CHF": 1.13,
    "HUF": 0.0028,
    "BRL": 0.17,
    "ILS": 0.28,
    "JPY": 0.0067,
    "HKD": 0.128,
}

# Exchange -> currency mapping
EXCHANGE_CURRENCY = {
    "US": "USD",
    "LSE": "GBP",
    "PA": "EUR",
    "AS": "EUR",
    "BR": "EUR",
    "XETRA": "EUR",
    "SW": "CHF",
    "VI": "EUR",
    "MC": "EUR",
    "IR": "EUR",
    "BUD": "HUF",
    "TSE": "JPY",
    "F": "EUR",
}


def fetch_fundamentals(symbol):
    """Fetch fundamentals from EODHD API."""
    url = f"{EODHD_BASE_URL}/fundamentals/{symbol}"
    resp = requests.get(url, params={"api_token": EODHD_API_KEY, "fmt": "json"}, timeout=30)
    if resp.status_code != 200:
        print(f"    HTTP {resp.status_code} for {symbol}")
        return None
    data = resp.json()
    if "General" not in data:
        return None
    return data


def extract_market_data(data, exchange):
    """Extract market cap, PE, PB, EPS from fundamentals response."""
    highlights = data.get("Highlights", {})

    market_cap = highlights.get("MarketCapitalization")
    pe_ratio = highlights.get("PERatio")
    pb_ratio = highlights.get("PriceBookMRQ")
    eps = highlights.get("EarningsShare")
    div_yield = highlights.get("DividendYield")

    # Market cap from API is typically in the listing currency
    # Convert to USD
    currency = EXCHANGE_CURRENCY.get(exchange, "USD")
    fx_rate = FX_RATES.get(currency, 1.0)

    market_cap_usd = None
    if market_cap and market_cap > 0:
        market_cap_usd = market_cap * fx_rate

    return {
        "market_cap": market_cap,
        "pe_ratio": pe_ratio if pe_ratio and pe_ratio > 0 else None,
        "pb_ratio": pb_ratio if pb_ratio and pb_ratio > 0 else None,
        "eps": eps,
        "market_cap_usd": market_cap_usd,
        "currency": currency,
        "fx_rate": fx_rate,
    }


def insert_market_data(conn, company_id, mdata, date_str):
    """Insert or update market_data row."""
    conn.execute("""
        INSERT OR REPLACE INTO market_data
            (company_id, date, market_cap, pe_ratio, pb_ratio, eps,
             market_cap_usd, fx_rate, currency, data_source, market_cap_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EODHD', 'fundamentals_api')
    """, (
        company_id, date_str,
        mdata["market_cap"], mdata["pe_ratio"], mdata["pb_ratio"], mdata["eps"],
        mdata["market_cap_usd"], mdata["fx_rate"], mdata["currency"]
    ))
    conn.commit()


def main():
    conn = sqlite3.connect(DB_PATH)
    today = datetime.now().strftime("%Y-%m-%d")

    success = 0
    failed = 0

    print(f"=== Populating market_data for {len(MISSING_STOCKS)} stocks ===\n")

    for i, (ticker, exchange, company_id) in enumerate(MISSING_STOCKS, 1):
        # Determine the API ticker to use
        if exchange == "TSE" and ticker in JP_ADR_MAP:
            adr_ticker, adr_exchange = JP_ADR_MAP[ticker]
            api_symbol = f"{adr_ticker}.{adr_exchange}"
            print(f"[{i}/{len(MISSING_STOCKS)}] {ticker}.{exchange} (id={company_id}) via {api_symbol}")
        elif exchange == "TSE" and ticker not in JP_ADR_MAP:
            print(f"[{i}/{len(MISSING_STOCKS)}] {ticker}.{exchange} (id={company_id}) - NO ADR, skipping")
            failed += 1
            continue
        else:
            api_symbol = f"{ticker}.{exchange}"
            # Some exchanges need different API codes
            if exchange == "XETRA":
                api_symbol = f"{ticker}.XETRA"
            elif exchange == "LSE":
                api_symbol = f"{ticker}.LSE"
            print(f"[{i}/{len(MISSING_STOCKS)}] {ticker}.{exchange} (id={company_id}) via {api_symbol}")

        data = fetch_fundamentals(api_symbol)
        if not data:
            print(f"    FAILED: no data")
            failed += 1
            time.sleep(0.5)
            continue

        # For Japanese ADRs, the market cap from ADR may not be JPY-denominated
        # The EODHD fundamentals API returns market cap in the listing currency
        if exchange == "TSE" and ticker in JP_ADR_MAP:
            adr_exchange = JP_ADR_MAP[ticker][1]
            mdata = extract_market_data(data, adr_exchange)
            # For ADRs listed on US exchanges, market cap is already in USD
            if adr_exchange == "US":
                mdata["currency"] = "USD"
                mdata["fx_rate"] = 1.0
                mdata["market_cap_usd"] = mdata["market_cap"]
            elif adr_exchange == "F":
                mdata["currency"] = "EUR"
                mdata["fx_rate"] = FX_RATES["EUR"]
                if mdata["market_cap"]:
                    mdata["market_cap_usd"] = mdata["market_cap"] * FX_RATES["EUR"]
        else:
            mdata = extract_market_data(data, exchange)

        if mdata["market_cap"] and mdata["market_cap"] > 0:
            insert_market_data(conn, company_id, mdata, today)
            print(f"    OK: mcap={mdata['market_cap']:,.0f}, pe={mdata['pe_ratio']}, pb={mdata['pb_ratio']}, eps={mdata['eps']}, mcap_usd={mdata['market_cap_usd']:,.0f}" if mdata['market_cap_usd'] else f"    OK: mcap={mdata['market_cap']:,.0f}")
            success += 1
        else:
            print(f"    WARN: no market_cap in response")
            failed += 1

        if i < len(MISSING_STOCKS):
            time.sleep(0.5)

    print(f"\n=== Done: {success} populated, {failed} failed ===")

    # Verify
    print("\n=== Verification ===")
    cursor = conn.cursor()
    for ticker, exchange, company_id in MISSING_STOCKS:
        cursor.execute("SELECT market_cap, pe_ratio, market_cap_usd FROM market_data WHERE company_id=? ORDER BY date DESC LIMIT 1", (company_id,))
        row = cursor.fetchone()
        status = f"mcap={row[0]:,.0f}, pe={row[1]}, mcap_usd={row[2]}" if row and row[0] else "MISSING"
        print(f"  {ticker}.{exchange}: {status}")

    conn.close()


if __name__ == "__main__":
    main()

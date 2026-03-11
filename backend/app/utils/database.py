"""
Database wrapper for EODHD database integration (read-only).
"""

from database.database_client import EODHDDatabase
from app.config import DATABASE_PATH


class DatabaseClient:
    """Wrapper around EODHDDatabase for Brown Advisory app."""

    def __init__(self):
        self.db = EODHDDatabase(db_path=DATABASE_PATH)

    def get_companies_by_exchanges(
        self,
        exchange_codes: list[str],
        market_cap_min: float = None,
        market_cap_max: float = None,
        adv_usd_min: float = None,
        adv_usd_max: float = None
    ) -> list[dict]:
        """Get active companies for given exchanges with optional liquidity filters."""
        where_clauses = ["c.is_active = 1", "m.market_cap_usd IS NOT NULL"]
        params = []

        if exchange_codes:
            placeholders = ','.join(['?' for _ in exchange_codes])
            where_clauses.append(f"c.exchange_code IN ({placeholders})")
            params.extend(exchange_codes)

        if market_cap_min is not None:
            where_clauses.append("m.market_cap >= ?")
            params.append(market_cap_min)

        if market_cap_max is not None:
            where_clauses.append("m.market_cap <= ?")
            params.append(market_cap_max)

        if adv_usd_min is not None:
            where_clauses.append("m.adv_usd_20d >= ?")
            params.append(adv_usd_min)

        if adv_usd_max is not None:
            where_clauses.append("m.adv_usd_20d <= ?")
            params.append(adv_usd_max)

        query = f"""
            SELECT c.company_id, c.ticker, c.exchange_code, c.full_name,
                   c.sector, c.industry, c.country, c.currency,
                   m.market_cap, m.market_cap_usd, m.adv_usd_20d
            FROM companies c
            INNER JOIN market_data m ON c.company_id = m.company_id
            INNER JOIN (
                SELECT company_id, MAX(date) as latest_date
                FROM market_data
                GROUP BY company_id
            ) latest ON m.company_id = latest.company_id AND m.date = latest.latest_date
            WHERE {' AND '.join(where_clauses)}
            ORDER BY c.ticker
        """

        rows = self.db.fetchall(query, tuple(params))

        companies = []
        for row in rows:
            companies.append({
                'company_id': row['company_id'],
                'ticker': row['ticker'],
                'exchange_code': row['exchange_code'],
                'full_name': row['full_name'],
                'sector': row['sector'],
                'industry': row['industry'],
                'country': row['country'],
                'currency': row['currency'],
                'market_cap': row['market_cap'],
                'market_cap_usd': row['market_cap_usd'],
                'adv_usd_20d': row['adv_usd_20d']
            })

        return companies

    def get_latest_fundamentals(self, company_id: int) -> dict | None:
        """Get latest IS, BS, CF for a company."""
        income_stmt = self.db.get_income_statements(company_id, limit=1)
        if not income_stmt:
            return None

        income = income_stmt[0]
        fiscal_year = income['fiscal_year']

        balance_sheets = self.db.get_balance_sheets(company_id, limit=10)
        balance = next((bs for bs in balance_sheets if bs['fiscal_year'] == fiscal_year), None)

        cash_flows = self.db.get_cash_flows(company_id, limit=10)
        cash_flow = next((cf for cf in cash_flows if cf['fiscal_year'] == fiscal_year), None)

        return {
            'fiscal_year': fiscal_year,
            'income_statement': income,
            'balance_sheet': balance,
            'cash_flow': cash_flow
        }

    def get_historical_income_statements(self, company_id: int, years: int = 10) -> list[dict]:
        """Get historical income statements for through-the-cycle metrics."""
        query = """
        SELECT fiscal_year, net_income, ebit, ebitda,
               income_before_tax, tax_provision, total_revenue
        FROM income_statements
        WHERE company_id = ?
        ORDER BY fiscal_year DESC
        LIMIT ?
        """
        rows = self.db.fetchall(query, (company_id, years))
        return [dict(row) for row in rows]

    def get_bulk_fundamentals(self, company_ids: list[int]) -> dict:
        """Batch-fetch latest fundamentals for many companies in 3 queries instead of 3N."""
        if not company_ids:
            return {}

        placeholders = ','.join(['?' for _ in company_ids])

        # Latest income statement per company
        income_rows = self.db.fetchall(f"""
            SELECT i.* FROM income_statements i
            INNER JOIN (
                SELECT company_id, MAX(fiscal_year) as max_fy
                FROM income_statements
                WHERE company_id IN ({placeholders})
                GROUP BY company_id
            ) latest ON i.company_id = latest.company_id AND i.fiscal_year = latest.max_fy
        """, tuple(company_ids))

        income_by_id = {}
        for row in income_rows:
            income_by_id[row['company_id']] = dict(row)

        # Latest balance sheet per company (matched to income fiscal year)
        balance_rows = self.db.fetchall(f"""
            SELECT b.* FROM balance_sheets b
            INNER JOIN (
                SELECT company_id, MAX(fiscal_year) as max_fy
                FROM balance_sheets
                WHERE company_id IN ({placeholders})
                GROUP BY company_id
            ) latest ON b.company_id = latest.company_id AND b.fiscal_year = latest.max_fy
        """, tuple(company_ids))

        balance_by_id = {}
        for row in balance_rows:
            balance_by_id[row['company_id']] = dict(row)

        # Latest cash flow per company
        cashflow_rows = self.db.fetchall(f"""
            SELECT cf.* FROM cash_flows cf
            INNER JOIN (
                SELECT company_id, MAX(fiscal_year) as max_fy
                FROM cash_flows
                WHERE company_id IN ({placeholders})
                GROUP BY company_id
            ) latest ON cf.company_id = latest.company_id AND cf.fiscal_year = latest.max_fy
        """, tuple(company_ids))

        cashflow_by_id = {}
        for row in cashflow_rows:
            cashflow_by_id[row['company_id']] = dict(row)

        # Assemble per company
        result = {}
        for cid in company_ids:
            income = income_by_id.get(cid)
            if not income:
                continue
            fiscal_year = income.get('fiscal_year')
            result[cid] = {
                'fiscal_year': fiscal_year,
                'income_statement': income,
                'balance_sheet': balance_by_id.get(cid),
                'cash_flow': cashflow_by_id.get(cid),
            }
        return result

    def get_bulk_historical_income(self, company_ids: list[int], years: int = 10) -> dict:
        """Batch-fetch historical income statements for many companies."""
        if not company_ids:
            return {}

        placeholders = ','.join(['?' for _ in company_ids])
        rows = self.db.fetchall(f"""
            SELECT company_id, fiscal_year, net_income, ebit, ebitda,
                   income_before_tax, tax_provision, total_revenue
            FROM income_statements
            WHERE company_id IN ({placeholders})
            ORDER BY company_id, fiscal_year DESC
        """, tuple(company_ids))

        result = {}
        for row in rows:
            cid = row['company_id']
            if cid not in result:
                result[cid] = []
            if len(result[cid]) < years:
                result[cid].append(dict(row))
        return result

    def get_bulk_pe_ratios(self, company_ids: list[int]) -> dict:
        """Batch-fetch pe_ratio from latest market_data for many companies."""
        if not company_ids:
            return {}
        placeholders = ','.join(['?' for _ in company_ids])
        rows = self.db.fetchall(f"""
            SELECT m.company_id, m.pe_ratio
            FROM market_data m
            INNER JOIN (
                SELECT company_id, MAX(date) as max_date
                FROM market_data
                WHERE company_id IN ({placeholders})
                GROUP BY company_id
            ) latest ON m.company_id = latest.company_id AND m.date = latest.max_date
            WHERE m.pe_ratio IS NOT NULL
        """, tuple(company_ids))
        return {row['company_id']: float(row['pe_ratio']) for row in rows}

    def search_companies(self, query: str, limit: int = 50) -> list[dict]:
        """Search companies by ticker or name."""
        search_term = f"%{query}%"
        sql = """
        SELECT company_id, ticker, exchange_code, full_name, sector, country
        FROM companies
        WHERE is_active = 1
          AND (ticker LIKE ? OR full_name LIKE ?)
        ORDER BY
          CASE WHEN ticker LIKE ? THEN 0 ELSE 1 END,
          ticker
        LIMIT ?
        """
        rows = self.db.fetchall(sql, (search_term, search_term, f"{query}%", limit))
        return [dict(row) for row in rows]

    def close(self):
        if self.db:
            self.db.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


_db_client = None

def get_db():
    """Get singleton database client instance."""
    global _db_client
    if _db_client is None:
        _db_client = DatabaseClient()
    return _db_client

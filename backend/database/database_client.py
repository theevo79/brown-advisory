"""
EODHD Database Client - Central database access for all applications

This module provides a clean interface to interact with the centralized
EODHD financial data database. All Claude-built apps should use this client
instead of accessing the database directly.

Usage:
    from database.database_client import EODHDDatabase

    db = EODHDDatabase()
    company_id = db.get_or_create_company('AAPL', 'US')
    db.save_income_statement(company_id, fiscal_year=2024, data={...})
"""

import os
import sqlite3
import json
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple, Any
from pathlib import Path
import threading

# Database location - uses DATABASE_PATH env var, falls back to backend/data/eodhd_data.db
DB_PATH = os.environ.get(
    'DATABASE_PATH',
    str(Path(__file__).resolve().parent.parent / 'data' / 'eodhd_data.db')
)


class EODHDDatabase:
    """
    Client for interacting with the central EODHD financial database.

    Features:
    - Thread-safe connection pooling
    - Automatic company registration
    - Cache-aware queries (respects expiry dates)
    - Helper methods for common operations
    - Currency and inflation adjustment support
    """

    # Thread-local storage for connections
    _local = threading.local()

    def __init__(self, db_path: str = DB_PATH):
        """
        Initialize database client.

        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path

    def get_connection(self) -> sqlite3.Connection:
        """
        Get thread-local database connection.
        Creates new connection if needed.
        """
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = sqlite3.connect(
                self.db_path,
                check_same_thread=False,
                timeout=30.0  # 30 second timeout for locks
            )
            self._local.conn.row_factory = sqlite3.Row  # Enable column access by name

            # Enable foreign keys
            self._local.conn.execute("PRAGMA foreign_keys = ON")

        return self._local.conn

    def close(self):
        """Close thread-local connection."""
        if hasattr(self._local, 'conn') and self._local.conn:
            self._local.conn.close()
            self._local.conn = None

    def execute(self, sql: str, params: tuple = None) -> sqlite3.Cursor:
        """
        Execute SQL query with parameters.

        Args:
            sql: SQL query string
            params: Query parameters (optional)

        Returns:
            SQLite cursor
        """
        conn = self.get_connection()
        cursor = conn.cursor()
        if params:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)
        conn.commit()
        return cursor

    def fetchone(self, sql: str, params: tuple = None) -> Optional[sqlite3.Row]:
        """Execute query and return single row."""
        cursor = self.execute(sql, params)
        return cursor.fetchone()

    def fetchall(self, sql: str, params: tuple = None) -> List[sqlite3.Row]:
        """Execute query and return all rows."""
        cursor = self.execute(sql, params)
        return cursor.fetchall()

    # ========================================================================
    # COMPANY MANAGEMENT
    # ========================================================================

    def get_or_create_company(
        self,
        ticker: str,
        exchange_code: str,
        full_name: str = None,
        sector: str = None,
        industry: str = None,
        country: str = None,
        currency: str = None
    ) -> int:
        """
        Get existing company_id or create new company.

        Args:
            ticker: Stock ticker symbol
            exchange_code: Exchange code (US, LSE, HK, etc.)
            full_name: Company full name (optional)
            sector: Business sector (optional)
            industry: Industry (optional)
            country: Country (optional)
            currency: Reporting currency (optional)

        Returns:
            company_id (integer)
        """
        # Try to find existing company
        row = self.fetchone(
            "SELECT company_id FROM companies WHERE ticker = ? AND exchange_code = ?",
            (ticker, exchange_code)
        )

        if row:
            return row['company_id']

        # Create new company
        cursor = self.execute("""
            INSERT INTO companies (ticker, exchange_code, full_name, sector, industry, country, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (ticker, exchange_code, full_name, sector, industry, country, currency))

        return cursor.lastrowid

    def get_company(self, ticker: str, exchange_code: str) -> Optional[Dict]:
        """
        Get company details by ticker and exchange.

        Returns:
            Dictionary with company data or None if not found
        """
        row = self.fetchone("""
            SELECT * FROM companies WHERE ticker = ? AND exchange_code = ?
        """, (ticker, exchange_code))

        return dict(row) if row else None

    def update_company(self, company_id: int, **kwargs):
        """
        Update company fields.

        Args:
            company_id: Company ID
            **kwargs: Fields to update (full_name, sector, industry, etc.)
        """
        if not kwargs:
            return

        fields = ', '.join([f"{k} = ?" for k in kwargs.keys()])
        values = list(kwargs.values()) + [company_id]

        self.execute(f"""
            UPDATE companies
            SET {fields}, updated_at = datetime('now')
            WHERE company_id = ?
        """, tuple(values))

    # ========================================================================
    # FUNDAMENTAL DATA - INCOME STATEMENTS
    # ========================================================================

    def save_income_statement(
        self,
        company_id: int,
        fiscal_year: int,
        period_end_date: str,
        data: Dict[str, Any]
    ):
        """
        Save income statement data.

        Args:
            company_id: Company ID
            fiscal_year: Fiscal year
            period_end_date: Period end date (YYYY-MM-DD)
            data: Dictionary with income statement fields
        """
        # Build INSERT OR REPLACE query
        fields = ['company_id', 'fiscal_year', 'period_end_date']
        values = [company_id, fiscal_year, period_end_date]

        # Add data fields
        for key, value in data.items():
            fields.append(key)
            values.append(value)

        placeholders = ', '.join(['?'] * len(fields))
        field_list = ', '.join(fields)

        self.execute(f"""
            INSERT OR REPLACE INTO income_statements ({field_list})
            VALUES ({placeholders})
        """, tuple(values))

    def get_income_statements(
        self,
        company_id: int,
        limit: int = 10
    ) -> List[Dict]:
        """
        Get income statements for a company.

        Args:
            company_id: Company ID
            limit: Number of years to retrieve (default: 10)

        Returns:
            List of income statement dictionaries
        """
        rows = self.fetchall("""
            SELECT * FROM income_statements
            WHERE company_id = ?
            ORDER BY fiscal_year DESC, period_end_date DESC
            LIMIT ?
        """, (company_id, limit))

        return [dict(row) for row in rows]

    # ========================================================================
    # FUNDAMENTAL DATA - BALANCE SHEETS
    # ========================================================================

    def save_balance_sheet(
        self,
        company_id: int,
        fiscal_year: int,
        period_end_date: str,
        data: Dict[str, Any]
    ):
        """Save balance sheet data."""
        fields = ['company_id', 'fiscal_year', 'period_end_date']
        values = [company_id, fiscal_year, period_end_date]

        for key, value in data.items():
            fields.append(key)
            values.append(value)

        placeholders = ', '.join(['?'] * len(fields))
        field_list = ', '.join(fields)

        self.execute(f"""
            INSERT OR REPLACE INTO balance_sheets ({field_list})
            VALUES ({placeholders})
        """, tuple(values))

    def get_balance_sheets(
        self,
        company_id: int,
        limit: int = 10
    ) -> List[Dict]:
        """Get balance sheets for a company."""
        rows = self.fetchall("""
            SELECT * FROM balance_sheets
            WHERE company_id = ?
            ORDER BY fiscal_year DESC, period_end_date DESC
            LIMIT ?
        """, (company_id, limit))

        return [dict(row) for row in rows]

    # ========================================================================
    # FUNDAMENTAL DATA - CASH FLOWS
    # ========================================================================

    def save_cash_flow(
        self,
        company_id: int,
        fiscal_year: int,
        period_end_date: str,
        data: Dict[str, Any]
    ):
        """Save cash flow statement data."""
        fields = ['company_id', 'fiscal_year', 'period_end_date']
        values = [company_id, fiscal_year, period_end_date]

        for key, value in data.items():
            fields.append(key)
            values.append(value)

        placeholders = ', '.join(['?'] * len(fields))
        field_list = ', '.join(fields)

        self.execute(f"""
            INSERT OR REPLACE INTO cash_flows ({field_list})
            VALUES ({placeholders})
        """, tuple(values))

    def get_cash_flows(
        self,
        company_id: int,
        limit: int = 10
    ) -> List[Dict]:
        """Get cash flow statements for a company."""
        rows = self.fetchall("""
            SELECT * FROM cash_flows
            WHERE company_id = ?
            ORDER BY fiscal_year DESC, period_end_date DESC
            LIMIT ?
        """, (company_id, limit))

        return [dict(row) for row in rows]

    # ========================================================================
    # MARKET DATA - PRICES
    # ========================================================================

    def save_daily_price(
        self,
        company_id: int,
        trade_date: str,
        open_price: float = None,
        high_price: float = None,
        low_price: float = None,
        close_price: float = None,
        adjusted_close: float = None,
        volume: int = None
    ):
        """Save daily price data."""
        self.execute("""
            INSERT OR REPLACE INTO daily_prices
            (company_id, trade_date, open_price, high_price, low_price, close_price, adjusted_close, volume)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (company_id, trade_date, open_price, high_price, low_price, close_price, adjusted_close, volume))

    def get_daily_prices(
        self,
        company_id: int,
        start_date: str = None,
        end_date: str = None,
        limit: int = None
    ) -> List[Dict]:
        """
        Get daily prices for a company.

        Args:
            company_id: Company ID
            start_date: Start date (YYYY-MM-DD, optional)
            end_date: End date (YYYY-MM-DD, optional)
            limit: Maximum number of records (optional)

        Returns:
            List of price dictionaries
        """
        sql = "SELECT * FROM daily_prices WHERE company_id = ?"
        params = [company_id]

        if start_date:
            sql += " AND trade_date >= ?"
            params.append(start_date)

        if end_date:
            sql += " AND trade_date <= ?"
            params.append(end_date)

        sql += " ORDER BY trade_date DESC"

        if limit:
            sql += " LIMIT ?"
            params.append(limit)

        rows = self.fetchall(sql, tuple(params))
        return [dict(row) for row in rows]

    # ========================================================================
    # CACHE MANAGEMENT
    # ========================================================================

    def is_cache_valid(
        self,
        cache_type: str,
        cache_key: str
    ) -> bool:
        """
        Check if cached data is still valid.

        Args:
            cache_type: Type of cache (e.g., 'FUNDAMENTALS', 'PRICES')
            cache_key: Cache key (e.g., 'AAPL_US_fundamentals')

        Returns:
            True if cache is valid, False otherwise
        """
        row = self.fetchone("""
            SELECT status, expires_at FROM api_cache_metadata
            WHERE cache_type = ? AND cache_key = ?
        """, (cache_type, cache_key))

        if not row:
            return False

        if row['status'] != 'VALID':
            return False

        if row['expires_at']:
            expires_at = datetime.fromisoformat(row['expires_at'])
            if datetime.now() > expires_at:
                return False

        return True

    def update_cache_metadata(
        self,
        cache_type: str,
        cache_key: str,
        expiry_days: int = 1,
        company_id: int = None,
        status: str = 'VALID',
        error_message: str = None
    ):
        """
        Update cache metadata after fetching data.

        Args:
            cache_type: Type of cache
            cache_key: Cache key
            expiry_days: Days until cache expires
            company_id: Related company ID (optional)
            status: Cache status ('VALID', 'EXPIRED', 'ERROR')
            error_message: Error message if status is 'ERROR'
        """
        expires_at = (datetime.now() + timedelta(days=expiry_days)).isoformat()

        self.execute("""
            INSERT OR REPLACE INTO api_cache_metadata
            (cache_type, cache_key, expires_at, status, error_message, company_id)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (cache_type, cache_key, expires_at, status, error_message, company_id))

    def clear_expired_cache(self):
        """Delete expired cache metadata entries."""
        self.execute("""
            DELETE FROM api_cache_metadata
            WHERE expires_at < datetime('now')
        """)

    # ========================================================================
    # HELPER METHODS
    # ========================================================================

    def get_latest_fundamentals(self, ticker: str, exchange_code: str) -> Optional[Dict]:
        """
        Get latest fundamental data for a company.

        Returns:
            Dictionary with latest IS, BS, CF data or None
        """
        company = self.get_company(ticker, exchange_code)
        if not company:
            return None

        company_id = company['company_id']

        # Get latest income statement
        is_data = self.fetchone("""
            SELECT * FROM income_statements
            WHERE company_id = ?
            ORDER BY fiscal_year DESC, period_end_date DESC
            LIMIT 1
        """, (company_id,))

        # Get latest balance sheet
        bs_data = self.fetchone("""
            SELECT * FROM balance_sheets
            WHERE company_id = ?
            ORDER BY fiscal_year DESC, period_end_date DESC
            LIMIT 1
        """, (company_id,))

        # Get latest cash flow
        cf_data = self.fetchone("""
            SELECT * FROM cash_flows
            WHERE company_id = ?
            ORDER BY fiscal_year DESC, period_end_date DESC
            LIMIT 1
        """, (company_id,))

        return {
            'company': company,
            'income_statement': dict(is_data) if is_data else None,
            'balance_sheet': dict(bs_data) if bs_data else None,
            'cash_flow': dict(cf_data) if cf_data else None
        }

    def get_net_debt(self, company_id: int, fiscal_year: int) -> Optional[float]:
        """
        Calculate net debt for a specific fiscal year.

        Net Debt = Total Debt - Cash - Short Term Investments

        Returns:
            Net debt value or None if data not available
        """
        row = self.fetchone("""
            SELECT
                short_term_debt,
                long_term_debt,
                cash,
                short_term_investments
            FROM balance_sheets
            WHERE company_id = ? AND fiscal_year = ?
            ORDER BY period_end_date DESC
            LIMIT 1
        """, (company_id, fiscal_year))

        if not row:
            return None

        st_debt = row['short_term_debt'] or 0
        lt_debt = row['long_term_debt'] or 0
        cash = row['cash'] or 0
        st_inv = row['short_term_investments'] or 0

        return st_debt + lt_debt - cash - st_inv

    def get_database_stats(self) -> Dict:
        """Get database statistics (useful for monitoring)."""
        stats = {}

        # Count records in each table
        for table in ['companies', 'income_statements', 'balance_sheets',
                      'cash_flows', 'daily_prices', 'api_cache_metadata']:
            row = self.fetchone(f"SELECT COUNT(*) as cnt FROM {table}")
            stats[table] = row['cnt']

        # Database size
        import os
        if os.path.exists(self.db_path):
            stats['db_size_mb'] = os.path.getsize(self.db_path) / (1024 * 1024)

        return stats


# ==========================================================================
# CONVENIENCE FUNCTIONS (for quick access without class instantiation)
# ==========================================================================

def get_db() -> EODHDDatabase:
    """Get database client instance."""
    return EODHDDatabase()


def get_company_data(ticker: str, exchange_code: str) -> Optional[Dict]:
    """
    Quick function to get company's latest fundamental data.

    Args:
        ticker: Stock ticker
        exchange_code: Exchange code

    Returns:
        Dictionary with company data or None
    """
    db = get_db()
    return db.get_latest_fundamentals(ticker, exchange_code)


if __name__ == '__main__':
    # Test database connection
    print("Testing EODHD Database Connection...")
    print("=" * 80)

    db = EODHDDatabase()

    # Get database stats
    stats = db.get_database_stats()
    print("\nDatabase Statistics:")
    for key, value in stats.items():
        print(f"  {key}: {value}")

    # Test company operations
    print("\nTesting company operations...")
    company_id = db.get_or_create_company('TEST', 'US', full_name='Test Company Inc.')
    print(f"  Created/Retrieved company_id: {company_id}")

    company = db.get_company('TEST', 'US')
    print(f"  Company details: {company}")

    print("\nDatabase connection test successful!")
    print("=" * 80)

    db.close()

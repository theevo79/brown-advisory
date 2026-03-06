"""Momentum service - calculates trailing price returns and percentiles."""

from typing import Optional
from datetime import datetime, timedelta
from database.database_client import EODHDDatabase
from app.config import DATABASE_PATH


# Period definitions in calendar days
PERIOD_DAYS = {
    '1m': 30,
    '3m': 91,
    '6m': 182,
    '12m': 365,
}


class MomentumService:
    def __init__(self):
        self.db = EODHDDatabase(db_path=DATABASE_PATH)

    def get_momentum_for_companies(self, company_ids: list[int], period: str = '3m') -> dict:
        """
        Calculate trailing price returns for a list of companies.

        Returns dict of company_id -> return percentage.
        """
        if period not in PERIOD_DAYS:
            raise ValueError(f"Invalid period: {period}. Use: {list(PERIOD_DAYS.keys())}")

        days = PERIOD_DAYS[period]
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=days + 10)).strftime('%Y-%m-%d')

        results = {}
        for company_id in company_ids:
            ret = self._calculate_return(company_id, start_date, end_date, days)
            if ret is not None:
                results[company_id] = ret

        return results

    def get_momentum_percentiles(self, company_ids: list[int], period: str = '3m') -> dict:
        """
        Calculate momentum returns and their percentile ranks.

        Returns dict of company_id -> {return, percentile}.
        """
        returns = self.get_momentum_for_companies(company_ids, period)

        if not returns:
            return {}

        # Calculate percentiles
        all_values = sorted(returns.values())
        n = len(all_values)

        result = {}
        for cid, ret in returns.items():
            if n == 1:
                pct = 50.0
            else:
                rank = sum(1 for v in all_values if v <= ret)
                pct = round(((rank - 1) / (n - 1)) * 100, 1)
            result[cid] = {'return': round(ret, 2), 'percentile': pct}

        return result

    def get_bulk_momentum(self, company_ids: list[int]) -> dict:
        """
        Calculate momentum for all periods at once.

        Returns dict of company_id -> {return_1m, return_3m, ..., percentile_1m, ...}.
        """
        all_data = {}
        for period in PERIOD_DAYS:
            period_data = self.get_momentum_percentiles(company_ids, period)
            for cid, data in period_data.items():
                if cid not in all_data:
                    all_data[cid] = {}
                all_data[cid][f'return_{period}'] = data['return']
                all_data[cid][f'percentile_{period}'] = data['percentile']

        return all_data

    def _calculate_return(self, company_id: int, start_date: str, end_date: str, target_days: int) -> Optional[float]:
        """Calculate price return between two dates."""
        try:
            rows = self.db.fetchall("""
                SELECT trade_date, adjusted_close
                FROM daily_prices
                WHERE company_id = ? AND trade_date BETWEEN ? AND ?
                ORDER BY trade_date ASC
            """, (company_id, start_date, end_date))

            if not rows or len(rows) < 2:
                return None

            # Get the latest price and the price closest to target_days ago
            latest = rows[-1]
            latest_price = latest['adjusted_close']

            if not latest_price or latest_price <= 0:
                return None

            # Find the price closest to target_days ago
            target_date = datetime.strptime(end_date, '%Y-%m-%d') - timedelta(days=target_days)
            target_str = target_date.strftime('%Y-%m-%d')

            # Find closest available date
            start_price = None
            for row in rows:
                if row['trade_date'] <= target_str and row['adjusted_close'] and row['adjusted_close'] > 0:
                    start_price = row['adjusted_close']

            if not start_price:
                # Use earliest available price if no price before target date
                for row in rows:
                    if row['adjusted_close'] and row['adjusted_close'] > 0:
                        start_price = row['adjusted_close']
                        break

            if not start_price or start_price <= 0:
                return None

            return ((latest_price - start_price) / start_price) * 100

        except Exception as e:
            return None

    def close(self):
        self.db.close()

"""Base rate analysis service."""

from typing import List, Dict, Optional, Tuple
from datetime import datetime
import numpy as np
import pandas as pd

from app.utils.database import DatabaseClient
from app.models.base_rate import (
    BaseRateRequest,
    BaseRateResponse,
    PeerDistribution,
    HistoricalDataPoint,
    ProbabilityAnalysis
)


class BaseRateService:
    def __init__(self):
        self.db = DatabaseClient()

    def analyze(self, request: BaseRateRequest) -> BaseRateResponse:
        if '.' not in request.ticker:
            raise ValueError(f"Invalid ticker format: {request.ticker} (expected SYMBOL.EXCHANGE)")

        symbol, exchange = request.ticker.split('.', 1)
        company = self.db.db.get_company(symbol, exchange)
        if not company:
            raise ValueError(f"Company not found: {request.ticker}")

        company_id = company['company_id']
        company_name = company.get('full_name', request.ticker)
        sector = company.get('sector')

        # Get peer companies
        if request.peer_selection == 'custom' and request.custom_peers:
            peer_companies = self._get_custom_peers(request.custom_peers)
            peer_selection_method = "custom"
        else:
            peer_companies = self._get_sector_peers(sector, exchange, company_id)
            peer_selection_method = f"sector: {sector}"

        if not peer_companies:
            raise ValueError("No peer companies found")

        current_year = datetime.now().year
        start_year = current_year - request.years

        # Historical data for company and peers
        historical_data = self._calculate_historical_metrics(
            company_id,
            [p['company_id'] for p in peer_companies],
            request.metric,
            start_year,
            current_year
        )

        # All peer values across all years for distribution
        all_peer_values = self._get_all_peer_values(
            [p['company_id'] for p in peer_companies],
            request.metric,
            start_year,
            current_year
        )

        # Company's latest value
        latest_year = max(
            [h.year for h in historical_data if h.company_value is not None],
            default=current_year
        )
        current_company_value = next(
            (h.company_value for h in historical_data if h.year == latest_year and h.company_value is not None),
            None
        )

        peer_distribution = self._calculate_distribution(all_peer_values, current_company_value)
        probability_analysis = self._calculate_probabilities(peer_distribution)
        metric_name = self._get_metric_display_name(request.metric)

        return BaseRateResponse(
            company_name=company_name,
            ticker=request.ticker,
            sector=sector,
            metric=request.metric,
            metric_name=metric_name,
            current_value=current_company_value,
            peer_distribution=peer_distribution,
            historical_data=historical_data,
            peer_companies=[
                {"ticker": f"{p['ticker']}.{p['exchange_code']}", "name": p.get('full_name', '')}
                for p in peer_companies
            ],
            probability_analysis=probability_analysis,
            peer_selection_method=peer_selection_method,
            years_analyzed=request.years
        )

    def _get_sector_peers(self, sector: Optional[str], exchange: str, exclude_company_id: int) -> List[Dict]:
        if not sector:
            return []

        conn = self.db.db.get_connection()
        cursor = conn.cursor()

        cursor.execute('''
            SELECT DISTINCT c.company_id, c.ticker, c.exchange_code, c.full_name, c.sector
            FROM companies c
            WHERE c.sector = ?
            AND c.company_id != ?
            AND c.is_active = 1
            AND (
                EXISTS (SELECT 1 FROM income_statements i WHERE i.company_id = c.company_id)
                OR EXISTS (SELECT 1 FROM balance_sheets b WHERE b.company_id = c.company_id)
            )
            ORDER BY
                CASE WHEN c.exchange_code = ? THEN 0 ELSE 1 END,
                c.company_id
            LIMIT 50
        ''', (sector, exclude_company_id, exchange))

        companies = []
        for row in cursor.fetchall():
            companies.append({
                'company_id': row[0],
                'ticker': row[1],
                'exchange_code': row[2],
                'full_name': row[3],
                'sector': row[4]
            })
        return companies

    def _get_custom_peers(self, peer_tickers: List[str]) -> List[Dict]:
        companies = []
        for ticker in peer_tickers:
            if '.' not in ticker:
                continue
            symbol, exchange = ticker.split('.', 1)
            company = self.db.db.get_company(symbol, exchange)
            if company:
                companies.append(company)
        return companies

    def _calculate_historical_metrics(
        self, company_id: int, peer_ids: List[int], metric: str,
        start_year: int, end_year: int
    ) -> List[HistoricalDataPoint]:
        historical_data = []

        for year in range(start_year, end_year + 1):
            company_value = self._get_metric_value(company_id, metric, year)

            peer_values = []
            for peer_id in peer_ids:
                pv = self._get_metric_value(peer_id, metric, year)
                if pv is not None:
                    peer_values.append(pv)

            if len(peer_values) > 0:
                historical_data.append(HistoricalDataPoint(
                    year=year,
                    company_value=company_value,
                    peer_avg=float(np.mean(peer_values)),
                    peer_median=float(np.median(peer_values)),
                    peer_count=len(peer_values)
                ))

        return historical_data

    def _get_metric_value(self, company_id: int, metric: str, year: int) -> Optional[float]:
        conn = self.db.db.get_connection()
        cursor = conn.cursor()

        if metric == 'revenue_growth':
            cursor.execute('''
                SELECT curr.total_revenue, prev.total_revenue
                FROM income_statements curr
                LEFT JOIN income_statements prev
                    ON curr.company_id = prev.company_id AND prev.fiscal_year = curr.fiscal_year - 1
                WHERE curr.company_id = ? AND curr.fiscal_year = ?
            ''', (company_id, year))
            row = cursor.fetchone()
            if row and row[0] and row[1] and row[1] != 0:
                return ((row[0] - row[1]) / row[1]) * 100

        elif metric == 'roe':
            cursor.execute('''
                SELECT i.net_income, b.total_stockholder_equity
                FROM income_statements i
                JOIN balance_sheets b ON i.company_id = b.company_id AND i.fiscal_year = b.fiscal_year
                WHERE i.company_id = ? AND i.fiscal_year = ?
            ''', (company_id, year))
            row = cursor.fetchone()
            if row and row[0] and row[1] and row[1] != 0:
                return (row[0] / row[1]) * 100

        elif metric == 'roa':
            cursor.execute('''
                SELECT i.net_income, b.total_assets
                FROM income_statements i
                JOIN balance_sheets b ON i.company_id = b.company_id AND i.fiscal_year = b.fiscal_year
                WHERE i.company_id = ? AND i.fiscal_year = ?
            ''', (company_id, year))
            row = cursor.fetchone()
            if row and row[0] and row[1] and row[1] != 0:
                return (row[0] / row[1]) * 100

        elif metric == 'roic':
            cursor.execute('''
                SELECT i.ebit, b.total_assets, b.total_current_liabilities
                FROM income_statements i
                JOIN balance_sheets b ON i.company_id = b.company_id AND i.fiscal_year = b.fiscal_year
                WHERE i.company_id = ? AND i.fiscal_year = ?
            ''', (company_id, year))
            row = cursor.fetchone()
            if row and row[0] and row[1] and row[2]:
                invested_capital = row[1] - row[2]
                if invested_capital != 0:
                    return (row[0] / invested_capital) * 100

        elif metric == 'net_margin':
            cursor.execute('''
                SELECT net_income, total_revenue
                FROM income_statements
                WHERE company_id = ? AND fiscal_year = ?
            ''', (company_id, year))
            row = cursor.fetchone()
            if row and row[0] and row[1] and row[1] != 0:
                return (row[0] / row[1]) * 100

        elif metric == 'ebit_margin':
            cursor.execute('''
                SELECT ebit, total_revenue
                FROM income_statements
                WHERE company_id = ? AND fiscal_year = ?
            ''', (company_id, year))
            row = cursor.fetchone()
            if row and row[0] and row[1] and row[1] != 0:
                return (row[0] / row[1]) * 100

        elif metric == 'current_ratio':
            cursor.execute('''
                SELECT total_current_assets, total_current_liabilities
                FROM balance_sheets
                WHERE company_id = ? AND fiscal_year = ?
            ''', (company_id, year))
            row = cursor.fetchone()
            if row and row[0] and row[1] and row[1] != 0:
                return row[0] / row[1]

        elif metric == 'debt_to_equity':
            cursor.execute('''
                SELECT total_liab, total_stockholder_equity
                FROM balance_sheets
                WHERE company_id = ? AND fiscal_year = ?
            ''', (company_id, year))
            row = cursor.fetchone()
            if row and row[0] and row[1] and row[1] != 0:
                return row[0] / row[1]

        return None

    def _get_all_peer_values(self, peer_ids: List[int], metric: str, start_year: int, end_year: int) -> List[float]:
        values = []
        for year in range(start_year, end_year + 1):
            for peer_id in peer_ids:
                value = self._get_metric_value(peer_id, metric, year)
                if value is not None:
                    values.append(value)
        return values

    def _calculate_distribution(self, values: List[float], company_value: Optional[float]) -> PeerDistribution:
        if not values:
            raise ValueError(
                "No peer values available for this metric. "
                "Try a different metric or time period."
            )

        arr = np.array(values)

        if company_value is not None:
            percentile = (np.sum(arr < company_value) / len(arr)) * 100
        else:
            percentile = 50.0

        winsorized_min = float(np.percentile(arr, 1))
        winsorized_max = float(np.percentile(arr, 99))
        arr_winsorized = np.clip(arr, winsorized_min, winsorized_max)
        counts, bin_edges = np.histogram(arr_winsorized, bins=30)

        return PeerDistribution(
            min=float(np.min(arr)),
            q1=float(np.percentile(arr, 25)),
            median=float(np.median(arr)),
            q3=float(np.percentile(arr, 75)),
            max=float(np.max(arr)),
            mean=float(np.mean(arr)),
            std=float(np.std(arr)),
            company_percentile=percentile,
            histogram_bins=[float(x) for x in bin_edges],
            histogram_counts=[int(x) for x in counts],
            winsorized_min=winsorized_min,
            winsorized_max=winsorized_max,
            total_data_points=len(values)
        )

    def _calculate_probabilities(self, distribution: PeerDistribution) -> ProbabilityAnalysis:
        p = distribution.company_percentile
        return ProbabilityAnalysis(
            above_median=p / 100,
            above_75th=max(0, (p - 75) / 25) if p > 75 else 0,
            above_90th=max(0, (p - 90) / 10) if p > 90 else 0,
            below_25th=max(0, (25 - p) / 25) if p < 25 else 0,
            below_10th=max(0, (10 - p) / 10) if p < 10 else 0
        )

    def _get_metric_display_name(self, metric: str) -> str:
        names = {
            'revenue_growth': 'Revenue Growth (%)',
            'roe': 'Return on Equity (%)',
            'roa': 'Return on Assets (%)',
            'roic': 'Return on Invested Capital (%)',
            'net_margin': 'Net Profit Margin (%)',
            'ebit_margin': 'EBIT Margin (%)',
            'current_ratio': 'Current Ratio',
            'debt_to_equity': 'Debt/Equity Ratio'
        }
        return names.get(metric, metric.replace('_', ' ').title())

    def close(self):
        self.db.close()

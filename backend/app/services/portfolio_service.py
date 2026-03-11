"""Portfolio visualization service."""

from typing import List, Dict, Optional, Tuple
import numpy as np

from app.utils.database import DatabaseClient
from app.utils.app_database import get_app_db
from app.models.portfolio import (
    Holding, PortfolioCreateRequest, PortfolioResponse,
    PortfolioListItem, VisualizeRequest, VisualizationResponse,
    BucketBreakdown, MetricSummary
)
from app.services.construction_service import MARKET_CAP_BUCKETS, _get_market_cap_bucket


class PortfolioService:
    def __init__(self):
        self.db = DatabaseClient()
        self.app_db = get_app_db()

    def create_portfolio(self, request: PortfolioCreateRequest) -> PortfolioResponse:
        portfolio_id = self.app_db.execute(
            "INSERT INTO portfolios (name) VALUES (?)", (request.name,)
        )
        for h in request.holdings:
            self.app_db.execute(
                "INSERT INTO portfolio_holdings (portfolio_id, ticker, weight, shares) VALUES (?, ?, ?, ?)",
                (portfolio_id, h.ticker, h.weight, h.shares)
            )
        return self.get_portfolio(portfolio_id)

    def get_portfolio(self, portfolio_id: int) -> PortfolioResponse:
        portfolio = self.app_db.fetchone(
            "SELECT * FROM portfolios WHERE id = ?", (portfolio_id,)
        )
        if not portfolio:
            raise ValueError(f"Portfolio {portfolio_id} not found")

        holdings = self.app_db.fetchall(
            "SELECT ticker, weight, shares FROM portfolio_holdings WHERE portfolio_id = ?",
            (portfolio_id,)
        )

        return PortfolioResponse(
            id=portfolio['id'],
            name=portfolio['name'],
            holdings=[Holding(**h) for h in holdings],
            created_at=portfolio.get('created_at'),
            updated_at=portfolio.get('updated_at')
        )

    def update_portfolio(self, portfolio_id: int, request: PortfolioCreateRequest) -> PortfolioResponse:
        portfolio = self.app_db.fetchone(
            "SELECT * FROM portfolios WHERE id = ?", (portfolio_id,)
        )
        if not portfolio:
            raise ValueError(f"Portfolio {portfolio_id} not found")

        self.app_db.execute("UPDATE portfolios SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                           (request.name, portfolio_id))
        self.app_db.execute("DELETE FROM portfolio_holdings WHERE portfolio_id = ?", (portfolio_id,))

        for h in request.holdings:
            self.app_db.execute(
                "INSERT INTO portfolio_holdings (portfolio_id, ticker, weight, shares) VALUES (?, ?, ?, ?)",
                (portfolio_id, h.ticker, h.weight, h.shares)
            )
        return self.get_portfolio(portfolio_id)

    def delete_portfolio(self, portfolio_id: int):
        self.app_db.execute("DELETE FROM portfolios WHERE id = ?", (portfolio_id,))

    def list_portfolios(self) -> List[PortfolioListItem]:
        rows = self.app_db.fetchall("""
            SELECT p.id, p.name, p.created_at, COUNT(ph.id) as num_holdings
            FROM portfolios p
            LEFT JOIN portfolio_holdings ph ON p.id = ph.portfolio_id
            GROUP BY p.id
            ORDER BY p.updated_at DESC
        """)
        return [PortfolioListItem(
            id=r['id'], name=r['name'], num_holdings=r['num_holdings'],
            created_at=r.get('created_at')
        ) for r in rows]

    def visualize(self, request: VisualizeRequest) -> VisualizationResponse:
        holdings_data = []
        sector_map: Dict[str, List[Tuple[str, float]]] = {}
        country_map: Dict[str, List[Tuple[str, float]]] = {}

        total_weight = sum(h.weight for h in request.holdings)

        for h in request.holdings:
            if '.' not in h.ticker:
                holdings_data.append(MetricSummary(
                    ticker=h.ticker, company_name=h.ticker, weight=h.weight
                ))
                continue

            symbol, exchange = h.ticker.split('.', 1)
            company = self.db.db.get_company(symbol, exchange)

            if not company:
                holdings_data.append(MetricSummary(
                    ticker=h.ticker, company_name=h.ticker, weight=h.weight
                ))
                continue

            company_id = company['company_id']
            company_name = company.get('full_name', h.ticker)
            sector = company.get('sector', 'Unknown')
            country = company.get('country', 'Unknown')

            # Get latest fundamentals
            pe, pb, div_yield, roe, net_margin, market_cap, eps = self._get_company_metrics(company_id)

            # Compute CAPE (10-year avg earnings)
            cape = self._compute_cape(company_id, market_cap)

            holdings_data.append(MetricSummary(
                ticker=h.ticker,
                company_name=company_name,
                weight=h.weight,
                sector=sector,
                country=country,
                market_cap_usd=market_cap,
                pe_ratio=pe,
                pb_ratio=pb,
                div_yield=div_yield,
                roe=roe,
                net_margin=net_margin,
                eps=eps,
                cape_ratio=cape
            ))

            # Bucket assignments
            s = sector or 'Unknown'
            c = country or 'Unknown'
            sector_map.setdefault(s, []).append((h.ticker, h.weight))
            country_map.setdefault(c, []).append((h.ticker, h.weight))

        # Build a lookup from ticker -> metrics for bucket averages
        metrics_by_ticker = {h.ticker: h for h in holdings_data}

        # Build market cap map
        mcap_map: Dict[str, List[Tuple[str, float]]] = {}
        for h_data in holdings_data:
            bucket = _get_market_cap_bucket(h_data.market_cap_usd)
            mcap_map.setdefault(bucket, []).append((h_data.ticker, h_data.weight))

        # Build breakdowns
        sector_breakdown = self._build_breakdown(sector_map, metrics_by_ticker)
        country_breakdown = self._build_breakdown(country_map, metrics_by_ticker)
        mcap_breakdown_raw = self._build_breakdown(mcap_map, metrics_by_ticker)
        # Order by bucket size (Mega→Micro)
        mcap_order = [label for label, _, _ in MARKET_CAP_BUCKETS] + ["Unknown"]
        mcap_breakdown = sorted(mcap_breakdown_raw, key=lambda x: mcap_order.index(x.name) if x.name in mcap_order else 999)

        # Weighted metrics
        weighted_pe = self._weighted_metric(holdings_data, 'pe_ratio', total_weight)
        weighted_pb = self._weighted_metric(holdings_data, 'pb_ratio', total_weight)
        weighted_div = self._weighted_metric(holdings_data, 'div_yield', total_weight)
        weighted_roe = self._weighted_metric(holdings_data, 'roe', total_weight)
        weighted_margin = self._weighted_metric(holdings_data, 'net_margin', total_weight)
        weighted_cape = self._weighted_metric(holdings_data, 'cape_ratio', total_weight)

        # Concentration
        weights = sorted([h.weight for h in request.holdings], reverse=True)
        top_10_weight = sum(weights[:10])
        hhi = sum((w / total_weight * 100) ** 2 for w in weights) if total_weight > 0 else 0

        return VisualizationResponse(
            holdings=holdings_data,
            sector_breakdown=sector_breakdown,
            country_breakdown=country_breakdown,
            market_cap_breakdown=mcap_breakdown,
            total_weight=total_weight,
            num_holdings=len(request.holdings),
            weighted_pe=weighted_pe,
            weighted_pb=weighted_pb,
            weighted_div_yield=weighted_div,
            weighted_roe=weighted_roe,
            weighted_net_margin=weighted_margin,
            weighted_cape=weighted_cape,
            top_10_weight=top_10_weight,
            hhi=round(hhi, 1)
        )

    def _get_company_metrics(self, company_id: int):
        conn = self.db.db.get_connection()
        cursor = conn.cursor()

        pe = pb = div_yield = roe = net_margin = market_cap = eps = None

        # --- Tier 1: Try market_data table (pre-calculated) ---
        cursor.execute('''
            SELECT market_cap_usd, market_cap, pe_ratio, pb_ratio, eps
            FROM market_data
            WHERE company_id = ? AND market_cap IS NOT NULL
            ORDER BY date DESC LIMIT 1
        ''', (company_id,))
        md_row = cursor.fetchone()

        if md_row:
            market_cap = md_row[0] or md_row[1]  # prefer USD, fall back to native
            pe = md_row[2]
            pb = md_row[3]
            eps = md_row[4]

        # --- Tier 2: If no market_data, try price * shares ---
        if not market_cap:
            cursor.execute('''
                SELECT adjusted_close FROM daily_prices
                WHERE company_id = ? ORDER BY trade_date DESC LIMIT 1
            ''', (company_id,))
            price_row = cursor.fetchone()

            cursor.execute('''
                SELECT weighted_average_shares_outstanding_dil
                FROM income_statements
                WHERE company_id = ? AND weighted_average_shares_outstanding_dil IS NOT NULL
                ORDER BY fiscal_year DESC LIMIT 1
            ''', (company_id,))
            shares_row = cursor.fetchone()

            if price_row and shares_row and price_row[0] and shares_row[0]:
                market_cap = price_row[0] * shares_row[0]

        # --- Tier 3: Fundamentals for ROE, net margin, and fallback PE/PB ---
        cursor.execute('''
            SELECT net_income, total_revenue
            FROM income_statements
            WHERE company_id = ? AND net_income IS NOT NULL
            ORDER BY fiscal_year DESC LIMIT 1
        ''', (company_id,))
        inc = cursor.fetchone()

        cursor.execute('''
            SELECT total_stockholder_equity, total_assets
            FROM balance_sheets
            WHERE company_id = ? AND total_stockholder_equity IS NOT NULL
            ORDER BY fiscal_year DESC LIMIT 1
        ''', (company_id,))
        bal = cursor.fetchone()

        if inc and bal:
            ni, rev = inc[0], inc[1]
            eq = bal[0]
            if eq and eq != 0 and ni:
                roe = (ni / eq) * 100
            if rev and rev != 0 and ni:
                net_margin = (ni / rev) * 100

            # Fallback PE/PB from fundamentals if not from market_data
            if pe is None and market_cap and ni and ni != 0:
                calc_pe = market_cap / ni
                pe = calc_pe if calc_pe > 0 else None
            if pb is None and market_cap and eq and eq != 0:
                pb = market_cap / eq

        return pe, pb, div_yield, roe, net_margin, market_cap, eps

    def _compute_cape(self, company_id: int, market_cap: Optional[float], years: int = 10) -> Optional[float]:
        """Compute CAPE ratio: market_cap / avg(net_income over last N years)."""
        if not market_cap or market_cap <= 0:
            return None

        conn = self.db.db.get_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT net_income FROM income_statements
            WHERE company_id = ? AND net_income IS NOT NULL
            ORDER BY fiscal_year DESC LIMIT ?
        ''', (company_id, years))
        rows = cursor.fetchall()

        if len(rows) < 5:
            return None

        earnings = [r[0] for r in rows if r[0] is not None]
        if not earnings:
            return None

        avg_earnings = sum(earnings) / len(earnings)
        if avg_earnings <= 0:
            return None

        cape = market_cap / avg_earnings
        return round(cape, 2) if cape > 0 else None

    def _build_breakdown(self, bucket_map: Dict, metrics_by_ticker: Dict[str, MetricSummary] = None) -> List[BucketBreakdown]:
        result = []
        for name, items in bucket_map.items():
            weight = sum(w for _, w in items)
            tickers = [t for t, _ in items]

            avg_pe = avg_roe = avg_net_margin = avg_pb = None
            if metrics_by_ticker:
                avg_pe = self._bucket_weighted_avg(items, metrics_by_ticker, 'pe_ratio')
                avg_roe = self._bucket_weighted_avg(items, metrics_by_ticker, 'roe')
                avg_net_margin = self._bucket_weighted_avg(items, metrics_by_ticker, 'net_margin')
                avg_pb = self._bucket_weighted_avg(items, metrics_by_ticker, 'pb_ratio')

            result.append(BucketBreakdown(
                name=name, weight=weight, count=len(items), tickers=tickers,
                avg_pe=avg_pe, avg_roe=avg_roe, avg_net_margin=avg_net_margin, avg_pb=avg_pb
            ))
        result.sort(key=lambda x: x.weight, reverse=True)
        return result

    def _bucket_weighted_avg(self, items: List[Tuple[str, float]], metrics: Dict[str, MetricSummary], attr: str) -> Optional[float]:
        numerator = 0.0
        valid_weight = 0.0
        for ticker, weight in items:
            m = metrics.get(ticker)
            if m:
                val = getattr(m, attr, None)
                if val is not None:
                    numerator += weight * val
                    valid_weight += weight
        if valid_weight == 0:
            return None
        return round(numerator / valid_weight, 2)

    def _weighted_metric(self, holdings: List[MetricSummary], attr: str, total_weight: float) -> Optional[float]:
        if total_weight == 0:
            return None
        numerator = 0
        valid_weight = 0
        for h in holdings:
            val = getattr(h, attr, None)
            if val is not None:
                numerator += h.weight * val
                valid_weight += h.weight
        if valid_weight == 0:
            return None
        return round(numerator / valid_weight, 2)

    def close(self):
        self.db.close()

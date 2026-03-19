"""Portfolio construction service — impact analysis for portfolio changes."""

from typing import List, Dict, Optional
from app.utils.database import DatabaseClient
from app.utils.currency_converter import convert_to_usd
from app.models.construction import (
    ConstructionRequest, ConstructionResponse,
    HoldingImpact, BucketDelta
)


MARKET_CAP_BUCKETS = [
    ("Mega (>$200B)", 200e9, None),
    ("Large ($10B-$200B)", 10e9, 200e9),
    ("Mid ($2B-$10B)", 2e9, 10e9),
    ("Small ($300M-$2B)", 300e6, 2e9),
    ("Micro (<$300M)", 0, 300e6),
]


def _get_market_cap_bucket(market_cap: Optional[float]) -> str:
    if market_cap is None:
        return "Unknown"
    for label, lo, hi in MARKET_CAP_BUCKETS:
        if hi is None:
            if market_cap >= lo:
                return label
        elif lo <= market_cap < hi:
            return label
    return "Unknown"


def _weighted_metric(holdings: list, metric_attr: str, weight_attr: str) -> Optional[float]:
    """Compute weighted average of a metric across holdings."""
    total_w = 0.0
    total_val = 0.0
    for h in holdings:
        w = getattr(h, weight_attr, 0) or 0
        v = getattr(h, metric_attr, None)
        if v is not None and w > 0:
            total_w += w
            total_val += v * w
    if total_w > 0:
        return round(total_val / total_w, 2)
    return None


class ConstructionService:
    def __init__(self):
        self.db = DatabaseClient()

    def _get_company_metrics(self, company_id: int, company_country: Optional[str] = None):
        """Fetch PE, PB, ROE, net_margin, market_cap, and compute CAPE."""
        conn = self.db.db.get_connection()
        cursor = conn.cursor()

        pe = pb = roe = net_margin = market_cap = None

        # Try market_data table first
        cursor.execute('''
            SELECT market_cap_usd, market_cap, pe_ratio, pb_ratio
            FROM market_data
            WHERE company_id = ? AND market_cap IS NOT NULL
            ORDER BY date DESC LIMIT 1
        ''', (company_id,))
        md_row = cursor.fetchone()

        if md_row:
            market_cap = md_row[0] or md_row[1]
            pe = md_row[2]
            pb = md_row[3]

        # Fallback: price * shares
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

        # Fundamentals for ROE, net margin
        cursor.execute('''
            SELECT net_income, total_revenue
            FROM income_statements
            WHERE company_id = ? AND net_income IS NOT NULL
            ORDER BY fiscal_year DESC LIMIT 1
        ''', (company_id,))
        inc = cursor.fetchone()

        cursor.execute('''
            SELECT total_stockholder_equity
            FROM balance_sheets
            WHERE company_id = ? AND total_stockholder_equity IS NOT NULL
            ORDER BY fiscal_year DESC LIMIT 1
        ''', (company_id,))
        bal = cursor.fetchone()

        if inc and bal:
            ni, rev = inc[0], inc[1]
            eq = bal[0]
            if eq and eq != 0 and ni:
                roe = round((ni / eq) * 100, 2)
            if rev and rev != 0 and ni:
                net_margin = round((ni / rev) * 100, 2)
            if pe is None and market_cap and ni and ni != 0:
                # Convert net income to USD for PE calculation
                ni_usd = convert_to_usd(ni, company_country, is_financial_statement=True) or ni
                calc_pe = market_cap / ni_usd
                pe = round(calc_pe, 2) if calc_pe > 0 else None
            if pb is None and market_cap and eq and eq != 0:
                eq_usd = convert_to_usd(eq, company_country, is_financial_statement=True) or eq
                pb = round(market_cap / eq_usd, 2)

        # CAPE: market_cap / avg(net_income over 10 years) — with currency conversion
        cape = None
        if market_cap and market_cap > 0:
            cursor.execute('''
                SELECT net_income FROM income_statements
                WHERE company_id = ? AND net_income IS NOT NULL
                ORDER BY fiscal_year DESC LIMIT 10
            ''', (company_id,))
            rows = cursor.fetchall()
            if len(rows) >= 5:
                earnings = [r[0] for r in rows if r[0] is not None and r[0] > 0]
                if len(earnings) >= 3:
                    # Convert to USD before averaging
                    earnings_usd = [convert_to_usd(e, company_country, is_financial_statement=True) or e for e in earnings]
                    avg_e = sum(earnings_usd) / len(earnings_usd)
                    if avg_e > 0:
                        cape = round(market_cap / avg_e, 2)

        return pe, pb, roe, net_margin, market_cap, cape

    def analyze(self, request: ConstructionRequest) -> ConstructionResponse:
        holdings_impact = []
        current_sectors: Dict[str, float] = {}
        new_sectors: Dict[str, float] = {}
        current_countries: Dict[str, float] = {}
        new_countries: Dict[str, float] = {}
        current_mcap_buckets: Dict[str, float] = {}
        new_mcap_buckets: Dict[str, float] = {}

        num_additions = num_removals = num_changes = 0

        for h in request.holdings:
            ticker = h.ticker
            company_name = ticker
            sector = "Unknown"
            country = "Unknown"
            pe = pb = roe = net_margin = market_cap = cape = None

            if '.' in ticker:
                symbol, exchange = ticker.split('.', 1)
                company = self.db.db.get_company(symbol, exchange)
                if company:
                    company_name = company.get('full_name', ticker)
                    sector = company.get('sector', 'Unknown') or 'Unknown'
                    country = company.get('country', 'Unknown') or 'Unknown'
                    company_id = company['company_id']
                    pe, pb, roe, net_margin, market_cap, cape = self._get_company_metrics(company_id, country)

            delta = h.new_weight - h.current_weight

            if h.current_weight == 0 and h.new_weight > 0:
                num_additions += 1
            elif h.current_weight > 0 and h.new_weight == 0:
                num_removals += 1
            elif abs(delta) > 0.01:
                num_changes += 1

            impact = HoldingImpact(
                ticker=ticker,
                company_name=company_name,
                sector=sector,
                country=country,
                current_weight=h.current_weight,
                new_weight=h.new_weight,
                delta=round(delta, 2),
                market_cap_usd=market_cap,
                pe_ratio=pe,
                pb_ratio=pb,
                roe=roe,
                net_margin=net_margin,
                cape_ratio=cape,
            )
            holdings_impact.append(impact)

            # Bucket tracking
            current_sectors[sector] = current_sectors.get(sector, 0) + h.current_weight
            new_sectors[sector] = new_sectors.get(sector, 0) + h.new_weight
            current_countries[country] = current_countries.get(country, 0) + h.current_weight
            new_countries[country] = new_countries.get(country, 0) + h.new_weight

            mcap_bucket = _get_market_cap_bucket(market_cap)
            current_mcap_buckets[mcap_bucket] = current_mcap_buckets.get(mcap_bucket, 0) + h.current_weight
            new_mcap_buckets[mcap_bucket] = new_mcap_buckets.get(mcap_bucket, 0) + h.new_weight

        # Calculate pro-rata weights and alpha (6a)
        # Pro-rata = each holding scaled proportionally so total = new_total
        _cur_total = sum(h.current_weight for h in request.holdings)
        _new_total = sum(h.new_weight for h in request.holdings)
        if _cur_total > 0 and _new_total > 0:
            scale = _new_total / _cur_total
            for h in holdings_impact:
                h.pro_rata_weight = round(h.current_weight * scale, 2)
                h.alpha = round(h.new_weight - h.pro_rata_weight, 2)
        else:
            for h in holdings_impact:
                h.pro_rata_weight = h.current_weight
                h.alpha = round(h.new_weight - h.current_weight, 2)

        # Calculate bucket deltas
        def _build_deltas(current_map, new_map):
            all_keys = set(list(current_map.keys()) + list(new_map.keys()))
            return [
                BucketDelta(
                    name=k,
                    current_weight=round(current_map.get(k, 0), 2),
                    new_weight=round(new_map.get(k, 0), 2),
                    delta=round(new_map.get(k, 0) - current_map.get(k, 0), 2)
                )
                for k in sorted(all_keys)
            ]

        sector_deltas = _build_deltas(current_sectors, new_sectors)
        country_deltas = _build_deltas(current_countries, new_countries)

        # Order market cap buckets by size
        mcap_order = [label for label, _, _ in MARKET_CAP_BUCKETS] + ["Unknown"]
        all_mcap_keys = set(list(current_mcap_buckets.keys()) + list(new_mcap_buckets.keys()))
        market_cap_deltas = [
            BucketDelta(
                name=k,
                current_weight=round(current_mcap_buckets.get(k, 0), 2),
                new_weight=round(new_mcap_buckets.get(k, 0), 2),
                delta=round(new_mcap_buckets.get(k, 0) - current_mcap_buckets.get(k, 0), 2)
            )
            for k in mcap_order if k in all_mcap_keys
        ]

        # Concentration metrics
        current_weights = sorted([h.current_weight for h in request.holdings], reverse=True)
        new_weights = sorted([h.new_weight for h in request.holdings], reverse=True)

        current_total = sum(current_weights)
        new_total = sum(new_weights)

        current_top10 = sum(current_weights[:10])
        new_top10 = sum(new_weights[:10])

        current_hhi = sum((w / current_total * 100) ** 2 for w in current_weights) if current_total > 0 else 0
        new_hhi = sum((w / new_total * 100) ** 2 for w in new_weights) if new_total > 0 else 0

        # Weighted metrics (current and new weights)
        current_weighted_pe = _weighted_metric(holdings_impact, 'pe_ratio', 'current_weight')
        current_weighted_cape = _weighted_metric(holdings_impact, 'cape_ratio', 'current_weight')
        current_weighted_pb = _weighted_metric(holdings_impact, 'pb_ratio', 'current_weight')
        current_weighted_roe = _weighted_metric(holdings_impact, 'roe', 'current_weight')
        current_weighted_net_margin = _weighted_metric(holdings_impact, 'net_margin', 'current_weight')
        weighted_pe = _weighted_metric(holdings_impact, 'pe_ratio', 'new_weight')
        weighted_cape = _weighted_metric(holdings_impact, 'cape_ratio', 'new_weight')
        weighted_pb = _weighted_metric(holdings_impact, 'pb_ratio', 'new_weight')
        weighted_roe = _weighted_metric(holdings_impact, 'roe', 'new_weight')
        weighted_net_margin = _weighted_metric(holdings_impact, 'net_margin', 'new_weight')

        return ConstructionResponse(
            holdings=holdings_impact,
            sector_deltas=sector_deltas,
            country_deltas=country_deltas,
            market_cap_deltas=market_cap_deltas,
            current_total=round(current_total, 2),
            new_total=round(new_total, 2),
            num_additions=num_additions,
            num_removals=num_removals,
            num_changes=num_changes,
            current_top10=round(current_top10, 2),
            new_top10=round(new_top10, 2),
            current_hhi=round(current_hhi, 1),
            new_hhi=round(new_hhi, 1),
            current_weighted_pe=current_weighted_pe,
            current_weighted_cape=current_weighted_cape,
            current_weighted_pb=current_weighted_pb,
            current_weighted_roe=current_weighted_roe,
            current_weighted_net_margin=current_weighted_net_margin,
            weighted_pe=weighted_pe,
            weighted_cape=weighted_cape,
            weighted_pb=weighted_pb,
            weighted_roe=weighted_roe,
            weighted_net_margin=weighted_net_margin,
        )

    def close(self):
        self.db.close()

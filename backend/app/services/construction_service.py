"""Portfolio construction service — impact analysis for portfolio changes."""

from typing import List, Dict, Tuple, Optional
from app.utils.database import DatabaseClient
from app.models.construction import (
    ConstructionRequest, ConstructionResponse,
    HoldingImpact, BucketDelta
)


class ConstructionService:
    def __init__(self):
        self.db = DatabaseClient()

    def analyze(self, request: ConstructionRequest) -> ConstructionResponse:
        holdings_impact = []
        current_sectors: Dict[str, float] = {}
        new_sectors: Dict[str, float] = {}
        current_countries: Dict[str, float] = {}
        new_countries: Dict[str, float] = {}

        num_additions = num_removals = num_changes = 0

        for h in request.holdings:
            ticker = h.ticker
            company_name = ticker
            sector = "Unknown"
            country = "Unknown"

            if '.' in ticker:
                symbol, exchange = ticker.split('.', 1)
                company = self.db.db.get_company(symbol, exchange)
                if company:
                    company_name = company.get('full_name', ticker)
                    sector = company.get('sector', 'Unknown') or 'Unknown'
                    country = company.get('country', 'Unknown') or 'Unknown'

            delta = h.new_weight - h.current_weight

            if h.current_weight == 0 and h.new_weight > 0:
                num_additions += 1
            elif h.current_weight > 0 and h.new_weight == 0:
                num_removals += 1
            elif abs(delta) > 0.01:
                num_changes += 1

            holdings_impact.append(HoldingImpact(
                ticker=ticker,
                company_name=company_name,
                sector=sector,
                country=country,
                current_weight=h.current_weight,
                new_weight=h.new_weight,
                delta=round(delta, 2)
            ))

            # Bucket tracking
            current_sectors[sector] = current_sectors.get(sector, 0) + h.current_weight
            new_sectors[sector] = new_sectors.get(sector, 0) + h.new_weight
            current_countries[country] = current_countries.get(country, 0) + h.current_weight
            new_countries[country] = new_countries.get(country, 0) + h.new_weight

        # Calculate bucket deltas
        all_sectors = set(list(current_sectors.keys()) + list(new_sectors.keys()))
        sector_deltas = [
            BucketDelta(
                name=s,
                current_weight=round(current_sectors.get(s, 0), 2),
                new_weight=round(new_sectors.get(s, 0), 2),
                delta=round(new_sectors.get(s, 0) - current_sectors.get(s, 0), 2)
            )
            for s in sorted(all_sectors)
        ]

        all_countries = set(list(current_countries.keys()) + list(new_countries.keys()))
        country_deltas = [
            BucketDelta(
                name=c,
                current_weight=round(current_countries.get(c, 0), 2),
                new_weight=round(new_countries.get(c, 0), 2),
                delta=round(new_countries.get(c, 0) - current_countries.get(c, 0), 2)
            )
            for c in sorted(all_countries)
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

        return ConstructionResponse(
            holdings=holdings_impact,
            sector_deltas=sector_deltas,
            country_deltas=country_deltas,
            current_total=round(current_total, 2),
            new_total=round(new_total, 2),
            num_additions=num_additions,
            num_removals=num_removals,
            num_changes=num_changes,
            current_top10=round(current_top10, 2),
            new_top10=round(new_top10, 2),
            current_hhi=round(current_hhi, 1),
            new_hhi=round(new_hhi, 1)
        )

    def close(self):
        self.db.close()

"""Heatmap service for market visualization."""

from collections import defaultdict
from app.services.screening_service import ScreeningService
from app.models.screening import ScreeningRequest


class HeatmapService:
    def __init__(self):
        self.screening_service = ScreeningService()

    def get_market_heatmap(self, request: ScreeningRequest, momentum_data: dict = None) -> dict:
        """Generate country x sector heatmap with average metric values."""
        if len(request.metrics) != 1:
            raise ValueError("Heatmap requires exactly one metric")

        metric = request.metrics[0]
        screening_response = self.screening_service.screen_companies(request)

        companies_with_metrics = []
        for company in screening_response.results:
            metric_obj = company.metrics.get(metric)
            if metric_obj and metric_obj.value is not None:
                entry = {
                    'ticker': company.ticker,
                    'company_name': company.company_name,
                    'company_id': company.company_id,
                    'country': company.country,
                    'sector': company.sector,
                    'industry': company.industry,
                    'metric_value': metric_obj.value,
                    'percentile': metric_obj.percentile,
                    'market_cap': company.market_cap,
                }
                # Attach momentum if available
                if momentum_data and company.company_id in momentum_data:
                    entry['momentum'] = momentum_data[company.company_id]
                companies_with_metrics.append(entry)

        return self._build_heatmap_matrix(companies_with_metrics, metric, momentum_data)

    def _build_heatmap_matrix(self, companies: list, metric: str, momentum_data: dict = None) -> dict:
        valid_companies = [c for c in companies if c['country'] and c['sector']]

        if not valid_companies:
            return {
                'countries': [], 'sectors': [], 'matrix': [], 'counts': [],
                'companies': {}, 'metric': metric, 'total_companies': 0,
                'momentum_matrix': None
            }

        countries = sorted(set(c['country'] for c in valid_companies))
        sectors = sorted(set(c['sector'] for c in valid_companies))

        cell_data = defaultdict(list)
        for company in valid_companies:
            cell_data[(company['country'], company['sector'])].append(company)

        matrix = []
        counts = []
        momentum_matrix = []
        companies_map = {}

        for country in countries:
            country_row = []
            count_row = []
            momentum_row = []

            for sector in sectors:
                key = (country, sector)
                cell_companies = cell_data.get(key, [])

                if cell_companies:
                    values = [c['metric_value'] for c in cell_companies if c['metric_value'] is not None]
                    avg_value = round(sum(values) / len(values), 2) if values else None
                    country_row.append(avg_value)
                    count_row.append(len(cell_companies))

                    # Calculate average momentum for the cell
                    if momentum_data:
                        mom_values = [
                            c['momentum'] for c in cell_companies
                            if 'momentum' in c and c['momentum'] is not None
                        ]
                        avg_mom = round(sum(mom_values) / len(mom_values), 1) if mom_values else None
                        momentum_row.append(avg_mom)
                    else:
                        momentum_row.append(None)

                    companies_map[f"{country}_{sector}"] = [
                        {
                            'ticker': c['ticker'],
                            'company_name': c['company_name'],
                            'industry': c['industry'],
                            'metric_value': c['metric_value'],
                            'market_cap': c.get('market_cap'),
                            'momentum': c.get('momentum'),
                        }
                        for c in cell_companies
                    ]
                else:
                    country_row.append(None)
                    count_row.append(0)
                    momentum_row.append(None)

            matrix.append(country_row)
            counts.append(count_row)
            momentum_matrix.append(momentum_row)

        return {
            'countries': countries,
            'sectors': sectors,
            'matrix': matrix,
            'counts': counts,
            'companies': companies_map,
            'metric': metric,
            'total_companies': len(valid_companies),
            'momentum_matrix': momentum_matrix if momentum_data else None,
        }

    def close(self):
        self.screening_service.close()

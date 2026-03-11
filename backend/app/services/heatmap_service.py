"""Heatmap service for market visualization."""

from collections import defaultdict
from app.services.screening_service import ScreeningService
from app.models.screening import ScreeningRequest
from app.utils.database import DatabaseClient
from app.utils.market_data import get_latest_market_cap
from app.utils.metrics_calculator import MetricsCalculator
from app.services.region_mapper import RegionMapper


# Core metrics to attach to every company in the heatmap companies map
CORE_METRICS = ['pe_ratio', 'pb_ratio', 'cape', 'roe', 'net_margin']


class HeatmapService:
    def __init__(self):
        self.screening_service = ScreeningService()

    def build_heatmap_from_results(self, screening_response, momentum_data: dict = None) -> dict:
        """Build heatmap from pre-computed screening results (avoids double-screening)."""
        if not screening_response.results:
            return {
                'countries': [], 'sectors': [], 'matrix': [], 'counts': [],
                'companies': {}, 'metric': '', 'total_companies': 0,
                'momentum_matrix': None
            }
        # First metric in the results is the focus metric
        metric = list(screening_response.results[0].metrics.keys())[0] if screening_response.results else ''
        return self._build_from_screening(screening_response, metric, momentum_data)

    def get_market_heatmap(self, request: ScreeningRequest, momentum_data: dict = None) -> dict:
        """Generate country x sector heatmap with average metric values."""
        if len(request.metrics) < 1:
            raise ValueError("Heatmap requires at least one metric")

        metric = request.metrics[0]
        screening_response = self.screening_service.screen_companies(request)
        return self._build_from_screening(screening_response, metric, momentum_data)

    def _build_from_screening(self, screening_response, metric: str, momentum_data: dict = None) -> dict:
        """Shared logic for building heatmap from screening results."""
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
                # Attach all core metrics from the screening results
                for m_id in CORE_METRICS:
                    m_obj = company.metrics.get(m_id)
                    if m_obj and m_obj.value is not None:
                        entry[m_id] = m_obj.value
                    else:
                        entry[m_id] = None
                companies_with_metrics.append(entry)

        return self._build_heatmap_matrix(companies_with_metrics, metric, momentum_data)

    def get_portfolio_heatmap(self, holdings: list, metric: str,
                               through_cycle_years: int = 10, min_years: int = 5) -> dict:
        """Generate heatmap from portfolio holdings with stock-level details."""
        db = DatabaseClient()
        calculator = MetricsCalculator()
        companies_with_metrics = []
        stock_details = []

        for holding in holdings:
            ticker = holding.get('ticker', '')
            weight = holding.get('weight', 0)

            if '.' not in ticker:
                continue

            symbol, exchange = ticker.split('.', 1)
            company = db.db.get_company(symbol, exchange)
            if not company:
                continue

            company_id = company['company_id']
            company_country = company.get('country')
            if not company_country:
                company_country = RegionMapper.get_country_from_exchange(exchange)
            elif len(company_country) == 2:
                company_country = RegionMapper.normalize_country(company_country)

            market_cap = get_latest_market_cap(company_id, db.db, company_country)
            if not market_cap or market_cap <= 0:
                continue

            # Get fundamentals and compute all metrics
            fundamentals = db.get_latest_fundamentals(company_id)
            historical_data = db.get_historical_income_statements(company_id, years=through_cycle_years)

            all_metrics = calculator.calculate_all_metrics(
                market_cap, fundamentals or {'income_statement': {}, 'balance_sheet': {}, 'cash_flow': {}},
                historical_data=historical_data if historical_data else None,
                through_cycle_years=through_cycle_years,
                min_years=min_years,
                company_country=company_country
            )

            metric_value = all_metrics.get(metric)
            if metric_value is None:
                continue

            sector = company.get('sector')
            country = company_country
            company_name = company.get('full_name', ticker)
            industry = company.get('industry')

            entry = {
                'ticker': ticker,
                'company_name': company_name,
                'company_id': company_id,
                'country': country,
                'sector': sector,
                'industry': industry,
                'metric_value': metric_value,
                'market_cap': market_cap,
            }
            # Attach core metrics
            for m_id in CORE_METRICS:
                entry[m_id] = all_metrics.get(m_id)
            companies_with_metrics.append(entry)

            # Build stock detail row
            stock_details.append({
                'ticker': ticker,
                'company_name': company_name,
                'country': country,
                'sector': sector,
                'weight': weight,
                'market_cap': market_cap,
                'pe_ratio': all_metrics.get('pe_ratio'),
                'pb_ratio': all_metrics.get('pb_ratio'),
                'cape': all_metrics.get('cape'),
                'roe': all_metrics.get('roe'),
                'net_margin': all_metrics.get('net_margin'),
            })

        db.close()

        result = self._build_heatmap_matrix(companies_with_metrics, metric)
        result['stock_details'] = stock_details
        return result

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
                            'company_id': c.get('company_id'),
                            'industry': c['industry'],
                            'metric_value': c['metric_value'],
                            'market_cap': c.get('market_cap'),
                            'momentum': c.get('momentum'),
                            'pe_ratio': c.get('pe_ratio'),
                            'pb_ratio': c.get('pb_ratio'),
                            'cape': c.get('cape'),
                            'roe': c.get('roe'),
                            'net_margin': c.get('net_margin'),
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

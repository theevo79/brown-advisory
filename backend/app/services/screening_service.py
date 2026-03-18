"""Stock screening service."""

from typing import List, Dict, Optional
from datetime import datetime

from app.utils.database import DatabaseClient
from app.utils.market_data import get_latest_market_cap, get_precalculated_ratio
from app.utils.metrics_calculator import MetricsCalculator
from app.utils.currency_converter import convert_to_usd
from app.services.region_mapper import RegionMapper
from app.services.momentum_service import MomentumService
from app.models.screening import (
    ScreeningRequest, ScreeningResponse, CompanyResult, MetricValue, MetricFilter
)


class ScreeningService:
    def __init__(self):
        self.db = DatabaseClient()
        self.calculator = MetricsCalculator()

    def screen_companies(self, request: ScreeningRequest) -> ScreeningResponse:
        exchanges = RegionMapper.get_exchanges_for_region(request.region)

        companies = self.db.get_companies_by_exchanges(
            exchanges,
            market_cap_min=request.market_cap_min,
            market_cap_max=request.market_cap_max,
            adv_usd_min=request.adv_usd_min,
            adv_usd_max=request.adv_usd_max
        )
        total_companies = len(companies)

        # Ensure focus metric is included in calculations
        metrics_to_calc = list(request.metrics)
        if request.valuation_metric and request.valuation_metric not in metrics_to_calc:
            metrics_to_calc.append(request.valuation_metric)

        MARKET_DATA_METRICS = {'pe_ratio'}
        THROUGH_CYCLE_METRICS = {'cape', 'ev_ebit_avg', 'ev_nopat_avg', 'cape_real', 'ev_ebit_avg_real', 'ev_nopat_avg_real'}
        needs_fundamentals = any(m not in MARKET_DATA_METRICS for m in metrics_to_calc)
        needs_historical = any(m in THROUGH_CYCLE_METRICS for m in metrics_to_calc)

        through_cycle_years = request.through_cycle_years or 5
        min_years = request.min_years or 3

        # Resolve market caps from pre-fetched data
        valid_companies = []
        for company in companies:
            company_country = company.get('country')
            if not company_country:
                company_country = RegionMapper.get_country_from_exchange(company['exchange_code'])
            elif len(company_country) == 2:
                company_country = RegionMapper.normalize_country(company_country)
            company['_country'] = company_country

            mc = company.get('market_cap_usd')
            mc_raw = company.get('market_cap')
            if mc and mc > 0 and mc_raw and mc_raw > 0:
                ratio = mc_raw / mc
                if ratio > 50:
                    mc = convert_to_usd(float(mc_raw), company_country, company.get('currency'))
            elif mc and mc > 0:
                pass
            elif mc_raw and mc_raw > 0:
                mc = convert_to_usd(float(mc_raw), company_country, company.get('currency'))
            else:
                continue
            if not mc or mc <= 0:
                continue
            company['_market_cap_usd'] = mc
            valid_companies.append(company)

        # Apply sector/country filters before expensive metric calculations
        if request.sectors:
            valid_companies = [c for c in valid_companies if c.get('sector') in request.sectors]
        if request.countries:
            valid_companies = [c for c in valid_companies if c['_country'] in request.countries]

        company_ids = [c['company_id'] for c in valid_companies]

        # Batch-fetch all fundamentals, historical data, and market data metrics
        bulk_fundamentals = {}
        bulk_historical = {}
        bulk_pe = {}
        if needs_fundamentals and company_ids:
            bulk_fundamentals = self.db.get_bulk_fundamentals(company_ids)
        if needs_historical and company_ids:
            bulk_historical = self.db.get_bulk_historical_income(company_ids, years=through_cycle_years)
        if 'pe_ratio' in metrics_to_calc and company_ids:
            bulk_pe = self.db.get_bulk_pe_ratios(company_ids)

        company_results = []
        for company in valid_companies:
            result = self._calculate_company_metrics_fast(
                company, metrics_to_calc,
                bulk_fundamentals.get(company['company_id']),
                bulk_historical.get(company['company_id']),
                through_cycle_years=through_cycle_years,
                min_years=min_years,
                pe_ratio=bulk_pe.get(company['company_id'])
            )
            if result:
                company_results.append(result)

        filtered_results = self._apply_filters(company_results, request.filters)
        final_results = self._calculate_percentiles_and_ranks(filtered_results, metrics_to_calc)

        if request.valuation_metric and (request.valuation_percentile_min is not None or request.valuation_percentile_max is not None):
            final_results = self._apply_percentile_filter(
                final_results, request.valuation_metric,
                request.valuation_percentile_min or 0,
                request.valuation_percentile_max or 100
            )

        # Momentum percentile filtering
        if request.momentum_period and (request.momentum_percentile_min is not None or request.momentum_percentile_max is not None):
            final_results = self._apply_momentum_filter(
                final_results, request.momentum_period,
                request.momentum_percentile_min or 0,
                request.momentum_percentile_max or 100
            )

        final_results.sort(key=lambda x: x.ticker)
        limited_results = final_results[:request.limit]

        return ScreeningResponse(
            results=limited_results,
            total_companies=total_companies,
            filtered_count=len(filtered_results),
            region=request.region,
            timestamp=datetime.utcnow().isoformat() + "Z"
        )

    def _calculate_company_metrics_fast(self, company: dict, metric_ids: List[str],
                                        fundamentals: Optional[dict], historical_data: Optional[list],
                                        through_cycle_years: int = 5, min_years: int = 3,
                                        pe_ratio: Optional[float] = None) -> Optional[CompanyResult]:
        """Calculate metrics using pre-fetched bulk data (no per-company DB queries)."""
        company_country = company['_country']
        market_cap = company['_market_cap_usd']

        MARKET_DATA_METRICS = {'pe_ratio'}
        THROUGH_CYCLE_METRICS = {'cape', 'ev_ebit_avg', 'ev_nopat_avg', 'cape_real', 'ev_ebit_avg_real', 'ev_nopat_avg_real'}

        all_metrics = {}
        fiscal_year = None

        if 'pe_ratio' in metric_ids and pe_ratio is not None:
            all_metrics['pe_ratio'] = pe_ratio

        needs_fundamentals = any(m not in MARKET_DATA_METRICS for m in metric_ids)
        needs_historical = any(m in THROUGH_CYCLE_METRICS for m in metric_ids)

        if needs_fundamentals and fundamentals:
            calculated_metrics = self.calculator.calculate_all_metrics(
                market_cap, fundamentals,
                historical_data=historical_data if needs_historical else None,
                through_cycle_years=through_cycle_years,
                min_years=min_years,
                company_country=company_country
            )
            for metric_id in metric_ids:
                if metric_id not in all_metrics and metric_id in calculated_metrics:
                    all_metrics[metric_id] = calculated_metrics[metric_id]
            fiscal_year = fundamentals.get('fiscal_year')
        elif needs_historical and historical_data:
            calculated_metrics = self.calculator.calculate_all_metrics(
                market_cap,
                {'income_statement': {}, 'balance_sheet': {}, 'cash_flow': {}},
                historical_data=historical_data,
                through_cycle_years=through_cycle_years,
                min_years=min_years,
                company_country=company_country
            )
            for metric_id in metric_ids:
                if metric_id in THROUGH_CYCLE_METRICS and metric_id in calculated_metrics:
                    all_metrics[metric_id] = calculated_metrics[metric_id]

        if metric_ids:
            has_any_metric = any(
                metric_id in all_metrics and all_metrics[metric_id] is not None
                for metric_id in metric_ids
            )
            if not has_any_metric:
                return None

        requested_metrics = {
            metric_id: MetricValue(value=all_metrics.get(metric_id))
            for metric_id in metric_ids
        }

        return CompanyResult(
            company_id=company['company_id'],
            ticker=company['ticker'],
            exchange=company['exchange_code'],
            country=company_country,
            company_name=company['full_name'],
            sector=company.get('sector'),
            industry=company.get('industry'),
            metrics=requested_metrics,
            composite_percentile=None,
            market_cap=market_cap,
            fiscal_year=fiscal_year
        )

    def _calculate_company_metrics(self, company: dict, metric_ids: List[str],
                                    through_cycle_years: int = 5, min_years: int = 3) -> Optional[CompanyResult]:
        company_country = company.get('country')
        if not company_country:
            company_country = RegionMapper.get_country_from_exchange(company['exchange_code'])
        elif len(company_country) == 2:
            company_country = RegionMapper.normalize_country(company_country)

        market_cap = get_latest_market_cap(company['company_id'], self.db.db, company_country)
        if not market_cap or market_cap <= 0:
            return None

        MARKET_DATA_METRICS = {'pe_ratio'}
        THROUGH_CYCLE_METRICS = {'cape', 'ev_ebit_avg', 'ev_nopat_avg', 'cape_real', 'ev_ebit_avg_real', 'ev_nopat_avg_real'}

        needs_fundamentals = any(m not in MARKET_DATA_METRICS for m in metric_ids)
        needs_historical = any(m in THROUGH_CYCLE_METRICS for m in metric_ids)

        all_metrics = {}
        fiscal_year = None

        for metric_id in metric_ids:
            if metric_id in MARKET_DATA_METRICS:
                ratio = get_precalculated_ratio(company['company_id'], self.db.db, metric_id)
                if ratio is not None:
                    all_metrics[metric_id] = ratio

        if needs_fundamentals:
            fundamentals = self.db.get_latest_fundamentals(company['company_id'])
            if fundamentals:
                historical_data = None
                if needs_historical:
                    historical_data = self.db.get_historical_income_statements(
                        company['company_id'], years=through_cycle_years
                    )

                calculated_metrics = self.calculator.calculate_all_metrics(
                    market_cap, fundamentals,
                    historical_data=historical_data,
                    through_cycle_years=through_cycle_years,
                    min_years=min_years,
                    company_country=company_country
                )

                for metric_id in metric_ids:
                    if metric_id not in all_metrics and metric_id in calculated_metrics:
                        all_metrics[metric_id] = calculated_metrics[metric_id]

                fiscal_year = fundamentals.get('fiscal_year')
            else:
                if needs_historical:
                    historical_data = self.db.get_historical_income_statements(
                        company['company_id'], years=through_cycle_years
                    )
                    if historical_data:
                        calculated_metrics = self.calculator.calculate_all_metrics(
                            market_cap,
                            {'income_statement': {}, 'balance_sheet': {}, 'cash_flow': {}},
                            historical_data=historical_data,
                            through_cycle_years=through_cycle_years,
                            min_years=min_years,
                            company_country=company_country
                        )
                        for metric_id in metric_ids:
                            if metric_id in THROUGH_CYCLE_METRICS and metric_id in calculated_metrics:
                                all_metrics[metric_id] = calculated_metrics[metric_id]

        if metric_ids:
            has_any_metric = any(
                metric_id in all_metrics and all_metrics[metric_id] is not None
                for metric_id in metric_ids
            )
            if not has_any_metric:
                return None

        requested_metrics = {
            metric_id: MetricValue(value=all_metrics.get(metric_id))
            for metric_id in metric_ids
        }

        return CompanyResult(
            company_id=company['company_id'],
            ticker=company['ticker'],
            exchange=company['exchange_code'],
            country=company_country,
            company_name=company['full_name'],
            sector=company.get('sector'),
            industry=company.get('industry'),
            metrics=requested_metrics,
            composite_percentile=None,
            market_cap=market_cap,
            fiscal_year=fiscal_year
        )

    def _apply_filters(self, results: List[CompanyResult], filters: Optional[Dict[str, MetricFilter]]) -> List[CompanyResult]:
        if not filters:
            return results
        filtered = []
        for result in results:
            passes = True
            for metric_id, filter_spec in filters.items():
                metric_value = result.metrics.get(metric_id)
                if not metric_value or metric_value.value is None:
                    passes = False
                    break
                value = metric_value.value
                if filter_spec.min is not None and value < filter_spec.min:
                    passes = False
                    break
                if filter_spec.max is not None and value > filter_spec.max:
                    passes = False
                    break
            if passes:
                filtered.append(result)
        return filtered

    def _calculate_percentiles_and_ranks(self, results: List[CompanyResult], metric_ids: List[str]) -> List[CompanyResult]:
        import bisect

        for metric_id in metric_ids:
            all_values = [
                r.metrics[metric_id].value for r in results
                if metric_id in r.metrics and r.metrics[metric_id].value is not None
            ]
            if not all_values:
                continue

            lower_is_better = metric_id in ['debt_to_equity', 'net_debt_ebitda']
            n = len(all_values)

            # Sort once for percentile calculation
            if lower_is_better:
                sorted_pct = sorted(-v for v in all_values)
            else:
                sorted_pct = sorted(all_values)

            # Sort once for rank calculation
            sorted_rank = sorted(all_values, reverse=not lower_is_better)

            for result in results:
                if metric_id in result.metrics:
                    mv = result.metrics[metric_id]
                    if mv.value is None:
                        continue

                    # Percentile via binary search
                    pct_val = -mv.value if lower_is_better else mv.value
                    count_le = bisect.bisect_right(sorted_pct, pct_val)
                    if n == 1:
                        mv.percentile = 50.0
                    else:
                        mv.percentile = round(((count_le - 1) / (n - 1)) * 100, 1)

                    # Rank via binary search
                    try:
                        idx = sorted_rank.index(mv.value)
                        mv.rank = idx + 1
                    except ValueError:
                        mv.rank = None

        for result in results:
            percentiles = [mv.percentile for mv in result.metrics.values() if mv.percentile is not None]
            if percentiles:
                result.composite_percentile = sum(percentiles) / len(percentiles)

        return results

    def _apply_percentile_filter(self, results, metric_id, pmin, pmax):
        return [r for r in results
                if metric_id in r.metrics and r.metrics[metric_id].percentile is not None
                and pmin <= r.metrics[metric_id].percentile <= pmax]

    def _apply_momentum_filter(self, results: List[CompanyResult], period: str,
                                pmin: float, pmax: float) -> List[CompanyResult]:
        """Filter results by momentum percentile for a given period."""
        company_ids = [r.company_id for r in results]
        if not company_ids:
            return results

        momentum_svc = MomentumService()
        try:
            mom_data = momentum_svc.get_momentum_percentiles(company_ids, period)
        finally:
            momentum_svc.close()

        filtered = []
        for r in results:
            mom = mom_data.get(r.company_id)
            if mom and mom.get('percentile') is not None:
                if pmin <= mom['percentile'] <= pmax:
                    filtered.append(r)
        return filtered

    def close(self):
        self.db.close()

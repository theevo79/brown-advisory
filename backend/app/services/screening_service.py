"""Stock screening service."""

from typing import List, Dict, Optional
from datetime import datetime

from app.utils.database import DatabaseClient
from app.utils.market_data import get_latest_market_cap, get_precalculated_ratio
from app.utils.metrics_calculator import MetricsCalculator
from app.services.region_mapper import RegionMapper
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

        company_results = []
        for company in companies:
            result = self._calculate_company_metrics(
                company, request.metrics,
                through_cycle_years=request.through_cycle_years or 5,
                min_years=request.min_years or 3
            )
            if result:
                company_results.append(result)

        filtered_results = self._apply_filters(company_results, request.filters)
        final_results = self._calculate_percentiles_and_ranks(filtered_results, request.metrics)

        if request.valuation_metric and (request.valuation_percentile_min is not None or request.valuation_percentile_max is not None):
            final_results = self._apply_percentile_filter(
                final_results, request.valuation_metric,
                request.valuation_percentile_min or 0,
                request.valuation_percentile_max or 100
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
        for metric_id in metric_ids:
            all_values = [
                r.metrics[metric_id].value for r in results
                if metric_id in r.metrics and r.metrics[metric_id].value is not None
            ]
            if not all_values:
                continue

            lower_is_better = metric_id in ['debt_to_equity']

            for result in results:
                if metric_id in result.metrics:
                    mv = result.metrics[metric_id]
                    if mv.value is None:
                        continue
                    if lower_is_better:
                        inv_values = [-v for v in all_values]
                        mv.percentile = self.calculator.calculate_percentile(-mv.value, inv_values)
                    else:
                        mv.percentile = self.calculator.calculate_percentile(mv.value, all_values)
                    mv.rank = self.calculator.calculate_rank(mv.value, all_values, ascending=lower_is_better)

        for result in results:
            percentiles = [mv.percentile for mv in result.metrics.values() if mv.percentile is not None]
            if percentiles:
                result.composite_percentile = sum(percentiles) / len(percentiles)

        return results

    def _apply_percentile_filter(self, results, metric_id, pmin, pmax):
        return [r for r in results
                if metric_id in r.metrics and r.metrics[metric_id].percentile is not None
                and pmin <= r.metrics[metric_id].percentile <= pmax]

    def close(self):
        self.db.close()

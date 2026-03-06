"""
Financial metrics calculator.
Calculates valuation, profitability, and financial health metrics.
"""

from typing import Optional
from app.utils.currency_converter import convert_to_usd, convert_list_to_usd
from app.utils.cpi_data import CPIService


class MetricsCalculator:
    @staticmethod
    def calculate_pe_ratio(market_cap, net_income, company_country=None):
        if not market_cap or not net_income or net_income <= 0:
            return None
        net_income_usd = convert_to_usd(net_income, company_country, is_financial_statement=True)
        if not net_income_usd or net_income_usd <= 0:
            return None
        return round(market_cap / net_income_usd, 2)

    @staticmethod
    def calculate_pb_ratio(market_cap, total_equity):
        if not market_cap or not total_equity or total_equity <= 0:
            return None
        return round(market_cap / total_equity, 2)

    @staticmethod
    def calculate_ps_ratio(market_cap, revenue, company_country=None):
        if not market_cap or not revenue or revenue <= 0:
            return None
        revenue_usd = convert_to_usd(revenue, company_country, is_financial_statement=True)
        if not revenue_usd or revenue_usd <= 0:
            return None
        return round(market_cap / revenue_usd, 2)

    @staticmethod
    def calculate_ev_ebitda(market_cap, net_debt, ebitda, company_country=None):
        if not market_cap or ebitda is None or ebitda <= 0:
            return None
        net_debt_usd = convert_to_usd(net_debt, company_country, is_financial_statement=True) if net_debt else 0
        ebitda_usd = convert_to_usd(ebitda, company_country, is_financial_statement=True)
        if not ebitda_usd or ebitda_usd <= 0:
            return None
        return round((market_cap + net_debt_usd) / ebitda_usd, 2)

    @staticmethod
    def calculate_roe(net_income, total_equity):
        if not net_income or not total_equity or total_equity <= 0:
            return None
        return round((net_income / total_equity) * 100, 2)

    @staticmethod
    def calculate_roa(net_income, total_assets):
        if not net_income or not total_assets or total_assets <= 0:
            return None
        return round((net_income / total_assets) * 100, 2)

    @staticmethod
    def calculate_ebit_margin(ebit, revenue):
        if not ebit or not revenue or revenue <= 0:
            return None
        return round((ebit / revenue) * 100, 2)

    @staticmethod
    def calculate_net_margin(net_income, revenue):
        if net_income is None or not revenue or revenue <= 0:
            return None
        return round((net_income / revenue) * 100, 2)

    @staticmethod
    def calculate_current_ratio(current_assets, current_liabilities):
        if not current_assets or not current_liabilities or current_liabilities <= 0:
            return None
        return round(current_assets / current_liabilities, 2)

    @staticmethod
    def calculate_debt_to_equity(total_liabilities, total_equity):
        if not total_liabilities or not total_equity or total_equity <= 0:
            return None
        return round(total_liabilities / total_equity, 2)

    @staticmethod
    def calculate_net_debt(short_term_debt, long_term_debt, cash):
        return (short_term_debt or 0) + (long_term_debt or 0) - (cash or 0)

    @staticmethod
    def calculate_ev_sales(market_cap, net_debt, revenue, company_country=None):
        if not market_cap or not revenue or revenue <= 0:
            return None
        net_debt_usd = convert_to_usd(net_debt, company_country, is_financial_statement=True) if net_debt else 0
        revenue_usd = convert_to_usd(revenue, company_country, is_financial_statement=True)
        if not revenue_usd or revenue_usd <= 0:
            return None
        return round((market_cap + net_debt_usd) / revenue_usd, 2)

    @staticmethod
    def calculate_ev_ebit(market_cap, net_debt, ebit, company_country=None):
        if not market_cap or not ebit or ebit <= 0:
            return None
        net_debt_usd = convert_to_usd(net_debt, company_country, is_financial_statement=True) if net_debt else 0
        ebit_usd = convert_to_usd(ebit, company_country, is_financial_statement=True)
        if not ebit_usd or ebit_usd <= 0:
            return None
        return round((market_cap + net_debt_usd) / ebit_usd, 2)

    @staticmethod
    def calculate_ev_fcf(market_cap, net_debt, free_cash_flow, company_country=None):
        if not market_cap or not free_cash_flow or free_cash_flow <= 0:
            return None
        net_debt_usd = convert_to_usd(net_debt, company_country, is_financial_statement=True) if net_debt else 0
        fcf_usd = convert_to_usd(free_cash_flow, company_country, is_financial_statement=True)
        if not fcf_usd or fcf_usd <= 0:
            return None
        return round((market_cap + net_debt_usd) / fcf_usd, 2)

    @staticmethod
    def calculate_effective_tax_rate(income_before_tax, tax_provision):
        if not income_before_tax or not tax_provision or income_before_tax <= 0:
            return 0.25
        tax_rate = tax_provision / income_before_tax
        if tax_rate < 0.05 or tax_rate > 0.40:
            return 0.25
        return tax_rate

    @staticmethod
    def calculate_cape(market_cap, historical_earnings, min_years=5, cpi_adjustments=None, company_country=None):
        if not market_cap or not historical_earnings:
            return None
        historical_earnings_usd = convert_list_to_usd(historical_earnings, company_country, is_financial_statement=True)
        valid_data = []
        for i, earning in enumerate(historical_earnings_usd):
            if earning is not None and earning > 0:
                cpi_factor = cpi_adjustments[i] if cpi_adjustments and i < len(cpi_adjustments) else 1.0
                valid_data.append(earning * cpi_factor)
        if len(valid_data) < min_years:
            return None
        avg_earnings = sum(valid_data) / len(valid_data)
        if avg_earnings <= 0:
            return None
        cape_value = market_cap / avg_earnings
        if cape_value > 2000:
            return None
        return round(cape_value, 2)

    @staticmethod
    def calculate_ev_nopat_avg(market_cap, net_debt, historical_ebit, historical_tax_rates=None, min_years=5, cpi_adjustments=None, company_country=None):
        if not market_cap or not historical_ebit:
            return None
        historical_ebit_usd = convert_list_to_usd(historical_ebit, company_country, is_financial_statement=True)
        nopat_values = []
        for i, ebit in enumerate(historical_ebit_usd):
            if ebit is not None and ebit > 0:
                tax_rate = historical_tax_rates[i] if historical_tax_rates and i < len(historical_tax_rates) else 0.25
                nopat = ebit * (1 - tax_rate)
                if cpi_adjustments and i < len(cpi_adjustments) and cpi_adjustments[i] is not None:
                    nopat = nopat * cpi_adjustments[i]
                nopat_values.append(nopat)
        if len(nopat_values) < min_years:
            return None
        avg_nopat = sum(nopat_values) / len(nopat_values)
        if avg_nopat <= 0:
            return None
        net_debt_usd = convert_to_usd(net_debt, company_country, is_financial_statement=True) if net_debt else 0
        return round((market_cap + net_debt_usd) / avg_nopat, 2)

    @staticmethod
    def calculate_ev_ebit_avg(market_cap, net_debt, historical_ebit, min_years=5, cpi_adjustments=None, company_country=None):
        if not market_cap or not historical_ebit:
            return None
        historical_ebit_usd = convert_list_to_usd(historical_ebit, company_country, is_financial_statement=True)
        valid_ebit = []
        for i, ebit in enumerate(historical_ebit_usd):
            if ebit is not None and ebit > 0:
                if cpi_adjustments and i < len(cpi_adjustments) and cpi_adjustments[i] is not None:
                    ebit = ebit * cpi_adjustments[i]
                valid_ebit.append(ebit)
        if len(valid_ebit) < min_years:
            return None
        avg_ebit = sum(valid_ebit) / len(valid_ebit)
        if avg_ebit <= 0:
            return None
        net_debt_usd = convert_to_usd(net_debt, company_country, is_financial_statement=True) if net_debt else 0
        return round((market_cap + net_debt_usd) / avg_ebit, 2)

    @staticmethod
    def calculate_percentile(value, all_values):
        if value is None:
            return None
        valid_values = [v for v in all_values if v is not None]
        if not valid_values:
            return None
        sorted_values = sorted(valid_values)
        count_less_or_equal = sum(1 for v in sorted_values if v <= value)
        if len(sorted_values) == 1:
            return 50.0
        return round(((count_less_or_equal - 1) / (len(sorted_values) - 1)) * 100, 1)

    @staticmethod
    def calculate_rank(value, all_values, ascending=False):
        if value is None:
            return None
        valid_values = [v for v in all_values if v is not None]
        if not valid_values:
            return None
        sorted_values = sorted(valid_values, reverse=not ascending)
        try:
            return sorted_values.index(value) + 1
        except ValueError:
            return None

    @classmethod
    def calculate_all_metrics(cls, market_cap, fundamentals, historical_data=None, through_cycle_years=10, min_years=5, company_country=None):
        income = fundamentals.get('income_statement', {}) or {}
        balance = fundamentals.get('balance_sheet', {}) or {}
        cash_flow_stmt = fundamentals.get('cash_flow', {}) or {}

        net_income = income.get('net_income')
        total_revenue = income.get('total_revenue')
        ebit = income.get('ebit')
        ebitda = income.get('ebitda')
        total_assets = balance.get('total_assets')
        total_equity = balance.get('total_stockholder_equity')
        total_liabilities = balance.get('total_liab')
        current_assets = balance.get('total_current_assets')
        current_liabilities = balance.get('total_current_liabilities')
        cash = balance.get('cash')
        short_term_debt = balance.get('short_term_debt')
        long_term_debt = balance.get('long_term_debt')
        free_cash_flow = cash_flow_stmt.get('free_cash_flow')

        net_debt = cls.calculate_net_debt(short_term_debt, long_term_debt, cash)

        metrics = {
            'pe_ratio': cls.calculate_pe_ratio(market_cap, net_income, company_country),
            'pb_ratio': cls.calculate_pb_ratio(market_cap, total_equity),
            'ps_ratio': cls.calculate_ps_ratio(market_cap, total_revenue, company_country),
            'ev_ebitda': cls.calculate_ev_ebitda(market_cap, net_debt, ebitda, company_country),
            'ev_sales': cls.calculate_ev_sales(market_cap, net_debt, total_revenue, company_country),
            'ev_ebit': cls.calculate_ev_ebit(market_cap, net_debt, ebit, company_country),
            'ev_fcf': cls.calculate_ev_fcf(market_cap, net_debt, free_cash_flow, company_country),
            'roe': cls.calculate_roe(net_income, total_equity),
            'roa': cls.calculate_roa(net_income, total_assets),
            'ebit_margin': cls.calculate_ebit_margin(ebit, total_revenue),
            'net_margin': cls.calculate_net_margin(net_income, total_revenue),
            'current_ratio': cls.calculate_current_ratio(current_assets, current_liabilities),
            'debt_to_equity': cls.calculate_debt_to_equity(total_liabilities, total_equity),
        }

        if historical_data and len(historical_data) >= min_years:
            historical_earnings = [row['net_income'] for row in historical_data[:through_cycle_years]]
            historical_ebit_vals = [row['ebit'] for row in historical_data[:through_cycle_years]]
            historical_tax_rates = [
                cls.calculate_effective_tax_rate(row.get('income_before_tax'), row.get('tax_provision'))
                for row in historical_data[:through_cycle_years]
            ]
            fiscal_years = [row.get('fiscal_year') for row in historical_data if row.get('fiscal_year')]
            cpi_adjustments = None
            if company_country and fiscal_years and CPIService.has_cpi_data(company_country):
                cpi_adjustments = CPIService.calculate_inflation_adjustments(company_country, fiscal_years)

            metrics['cape'] = cls.calculate_cape(market_cap, historical_earnings, min_years=min_years, company_country=company_country)
            metrics['ev_nopat_avg'] = cls.calculate_ev_nopat_avg(market_cap, net_debt, historical_ebit_vals, historical_tax_rates, min_years=min_years, company_country=company_country)
            metrics['ev_ebit_avg'] = cls.calculate_ev_ebit_avg(market_cap, net_debt, historical_ebit_vals, min_years=min_years, company_country=company_country)

            if cpi_adjustments and any(adj is not None for adj in cpi_adjustments):
                metrics['cape_real'] = cls.calculate_cape(market_cap, historical_earnings, min_years=min_years, cpi_adjustments=cpi_adjustments, company_country=company_country)
                metrics['ev_nopat_avg_real'] = cls.calculate_ev_nopat_avg(market_cap, net_debt, historical_ebit_vals, historical_tax_rates, min_years=min_years, cpi_adjustments=cpi_adjustments, company_country=company_country)
                metrics['ev_ebit_avg_real'] = cls.calculate_ev_ebit_avg(market_cap, net_debt, historical_ebit_vals, min_years=min_years, cpi_adjustments=cpi_adjustments, company_country=company_country)
            else:
                metrics['cape_real'] = None
                metrics['ev_nopat_avg_real'] = None
                metrics['ev_ebit_avg_real'] = None
        else:
            metrics['cape'] = None
            metrics['ev_nopat_avg'] = None
            metrics['ev_ebit_avg'] = None
            metrics['cape_real'] = None
            metrics['ev_nopat_avg_real'] = None
            metrics['ev_ebit_avg_real'] = None

        return metrics

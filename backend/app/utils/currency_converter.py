"""
Currency conversion utility for handling financial data in multiple currencies.
"""

from typing import Optional


CURRENCY_RATES = {
    'CNY': 7.0, 'TWD': 30.0, 'KRW': 1300.0, 'INR': 83.0, 'IDR': 15500.0,
    'THB': 34.0, 'MYR': 4.5, 'PHP': 55.0, 'VND': 24000.0, 'SGD': 1.35, 'HKD': 7.8,
    'BRL': 5.0, 'MXN': 17.0, 'ARS': 800.0, 'CLP': 900.0, 'COP': 4000.0, 'PEN': 3.7,
    'ZAR': 18.0, 'TRY': 32.0, 'PLN': 4.0, 'CZK': 23.0, 'HUF': 360.0, 'RUB': 90.0,
    'SAR': 3.75, 'AED': 3.67, 'QAR': 3.64, 'EGP': 30.0, 'NGN': 750.0, 'KES': 130.0,
    'USD': 1.0, 'EUR': 0.92, 'GBP': 0.79, 'JPY': 145.0, 'CHF': 0.88,
    'AUD': 1.52, 'CAD': 1.36, 'NOK': 10.5, 'SEK': 10.3, 'DKK': 6.9,
}

COUNTRY_CURRENCY = {
    'China': 'CNY', 'Taiwan': 'TWD', 'South Korea': 'KRW', 'India': 'INR',
    'Indonesia': 'IDR', 'Thailand': 'THB', 'Malaysia': 'MYR', 'Philippines': 'PHP',
    'Vietnam': 'VND', 'Singapore': 'SGD', 'Hong Kong': 'HKD',
    'Brazil': 'BRL', 'Mexico': 'MXN', 'Argentina': 'ARS', 'Chile': 'CLP',
    'Colombia': 'COP', 'Peru': 'PEN',
    'South Africa': 'ZAR', 'Turkey': 'TRY', 'Poland': 'PLN', 'Czech Republic': 'CZK',
    'Hungary': 'HUF', 'Russia': 'RUB', 'Saudi Arabia': 'SAR',
    'United Arab Emirates': 'AED', 'Qatar': 'QAR', 'Egypt': 'EGP',
    'Nigeria': 'NGN', 'Kenya': 'KES',
    'United States': 'USD', 'United Kingdom': 'GBP',
    'Germany': 'EUR', 'France': 'EUR', 'Italy': 'EUR', 'Spain': 'EUR',
    'Netherlands': 'EUR', 'Austria': 'EUR', 'Belgium': 'EUR', 'Finland': 'EUR',
    'Portugal': 'EUR', 'Ireland': 'EUR', 'Greece': 'EUR',
    'Switzerland': 'CHF', 'Norway': 'NOK', 'Sweden': 'SEK', 'Denmark': 'DKK',
    'Japan': 'JPY', 'Australia': 'AUD', 'Canada': 'CAD',
}


def get_currency_for_country(country: Optional[str]) -> Optional[str]:
    if not country:
        return None
    return COUNTRY_CURRENCY.get(country)


def get_conversion_rate(from_currency: str, to_currency: str = 'USD') -> float:
    if from_currency == to_currency:
        return 1.0
    if to_currency != 'USD':
        return 1.0
    rate = CURRENCY_RATES.get(from_currency)
    if not rate:
        return 1.0
    return 1.0 / rate


def convert_to_usd(
    amount: Optional[float],
    country: Optional[str],
    currency: Optional[str] = None,
    is_financial_statement: bool = False
) -> Optional[float]:
    if amount is None or amount == 0:
        return amount
    if not currency:
        currency = get_currency_for_country(country)
    if not currency or currency == 'USD':
        return amount
    rate = CURRENCY_RATES.get(currency)
    if not rate:
        return amount
    return amount / rate


def convert_list_to_usd(
    amounts: list[Optional[float]],
    country: Optional[str],
    currency: Optional[str] = None,
    is_financial_statement: bool = False
) -> list[Optional[float]]:
    return [convert_to_usd(amount, country, currency, is_financial_statement) for amount in amounts]

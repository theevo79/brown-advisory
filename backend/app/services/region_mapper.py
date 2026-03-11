"""Region mapping service."""

from typing import List

REGION_EXCHANGE_MAP = {
    "em_asia": ["SHG", "SHE", "TWSE", "KQ", "KO", "NSE", "BSE", "JK", "BK", "KLSE", "PSE", "HM",
                "NS", "TW", "TWO", "HK"],
    "em_latam": ["SA", "MX", "BA", "SN", "CL", "LIM"],
    "em_emea": ["JSE", "IS", "WSE", "PSE", "BUD", "SR", "QA", "ADX", "DFM", "CA", "XNAI",
                "WAR", "QSE", "ATH", "EGY", "PRA"],
    "dm_us": ["US"],
    "dm_europe": ["LSE", "PA", "XETRA", "MC", "MI", "AS", "SW", "OL", "ST", "CO", "HE", "VX",
                  "LIS", "AT", "IR", "MIL", "BR", "VI", "LS"],
    "dm_apac": ["TSE", "AU", "HK", "SG", "SI"],
    "global_ex_us": ["LSE", "PA", "XETRA", "MC", "MI", "AS", "SW", "OL", "ST", "CO", "HE", "VX",
                     "LIS", "AT", "IR", "TSE", "AU", "HK", "SG", "SHG", "SHE", "TWSE", "KQ", "KO",
                     "NSE", "BSE", "JK", "BK", "KLSE", "PSE", "HM", "SA", "MX", "BA", "SN", "CL",
                     "LIM", "JSE", "IS", "WSE", "BUD", "SR", "QA"],
    "global": [],
    # Legacy mappings for compatibility
    "emerging_markets": ["SHG", "SHE", "NS", "HK", "TW", "TWO", "SA", "MX", "SR", "JSE", "JK",
                         "WAR", "QSE", "SN", "PSE", "ATH", "BUD", "EGY", "PRA"],
    "north_america": ["US"],
    "europe": ["LSE", "XETRA", "PA", "SW", "AS", "ST", "MC", "CO", "OL", "VI", "MIL", "BR",
               "HE", "LS", "IR", "ATH", "BUD", "IS"],
    "all": ["US", "AU", "SHG", "SHE", "NS", "HK", "TW", "TWO", "SA", "MX", "SR", "JSE", "JK",
            "WAR", "QSE", "SN", "PSE", "ATH", "BUD", "EGY", "PRA", "LSE", "XETRA", "PA", "SW",
            "AS", "ST", "MC", "CO", "OL", "VI", "MIL", "BR", "HE", "LS", "IR", "IS"],
}

EXCHANGE_COUNTRY_MAP = {
    "US": "United States", "AU": "Australia",
    "SHG": "China", "SHE": "China", "HK": "Hong Kong",
    "BK": "Thailand", "NS": "India", "NSE": "India", "BSE": "India", "BO": "India",
    "TW": "Taiwan", "TWO": "Taiwan", "TWSE": "Taiwan",
    "JK": "Indonesia", "PSE": "Philippines",
    "KRX": "South Korea", "KO": "South Korea", "KQ": "South Korea",
    "MY": "Malaysia", "KLSE": "Malaysia",
    "SI": "Singapore", "SG": "Singapore",
    "SN": "Chile", "SA": "Brazil", "MX": "Mexico", "BA": "Argentina",
    "SR": "Saudi Arabia", "JSE": "South Africa", "WAR": "Poland", "WSE": "Poland",
    "QSE": "Qatar", "QA": "Qatar", "ATH": "Greece", "BUD": "Hungary",
    "EGY": "Egypt", "CA": "Egypt", "PRA": "Czech Republic",
    "LSE": "United Kingdom", "XETRA": "Germany", "PA": "France",
    "SW": "Switzerland", "VX": "Switzerland", "AS": "Netherlands",
    "ST": "Sweden", "MC": "Spain", "CO": "Denmark", "OL": "Norway",
    "VI": "Austria", "AT": "Austria", "MIL": "Italy", "MI": "Italy",
    "BR": "Belgium", "HE": "Finland", "LS": "Portugal", "LIS": "Portugal",
    "IR": "Ireland", "IS": "Turkey", "TSE": "Japan", "HM": "Vietnam",
}

COUNTRY_CODE_MAP = {
    'HK': 'Hong Kong', 'TH': 'Thailand', 'CN': 'China',
    'TW': 'Taiwan', 'SG': 'Singapore', 'MY': 'Malaysia',
    'ID': 'Indonesia', 'PH': 'Philippines', 'IN': 'India',
    'KR': 'South Korea', 'JP': 'Japan', 'AU': 'Australia',
    'BR': 'Brazil', 'MX': 'Mexico', 'AR': 'Argentina',
    'CL': 'Chile', 'CO': 'Colombia', 'PE': 'Peru',
    'ZA': 'South Africa', 'TR': 'Turkey', 'PL': 'Poland',
    'CZ': 'Czech Republic', 'HU': 'Hungary', 'RU': 'Russia',
    'SA': 'Saudi Arabia', 'AE': 'UAE', 'QA': 'Qatar',
    'EG': 'Egypt', 'NG': 'Nigeria', 'KE': 'Kenya',
    'US': 'United States', 'GB': 'United Kingdom', 'DE': 'Germany',
    'FR': 'France', 'IT': 'Italy', 'ES': 'Spain',
    'NL': 'Netherlands', 'BE': 'Belgium', 'CH': 'Switzerland',
    'SE': 'Sweden', 'NO': 'Norway', 'DK': 'Denmark',
    'FI': 'Finland', 'AT': 'Austria', 'IE': 'Ireland',
    'PT': 'Portugal', 'GR': 'Greece', 'CA': 'Canada',
    'VN': 'Vietnam',
}


class RegionMapper:
    @staticmethod
    def get_exchanges_for_region(region_id: str) -> List[str]:
        if region_id == "global":
            return REGION_EXCHANGE_MAP["all"]
        if region_id not in REGION_EXCHANGE_MAP:
            raise ValueError(f"Invalid region_id: {region_id}")
        return REGION_EXCHANGE_MAP[region_id]

    @staticmethod
    def get_country_from_exchange(exchange_code: str) -> str:
        return EXCHANGE_COUNTRY_MAP.get(exchange_code, "Unknown")

    @staticmethod
    def normalize_country(country: str) -> str:
        if len(country) == 2:
            return COUNTRY_CODE_MAP.get(country, country)
        return country

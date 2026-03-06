"""
Configuration settings for the Brown Advisory application.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

_BASE_DIR = Path(__file__).resolve().parent.parent  # backend directory

DATABASE_PATH = os.getenv(
    "DATABASE_PATH",
    str(_BASE_DIR / "data" / "eodhd_data.db")
)

EODHD_API_KEY = os.getenv("EODHD_API_KEY", "")

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3002,http://localhost:3003"
).split(",")

APP_NAME = "Brown Advisory - Investment Analytics API"
APP_VERSION = "1.0.0"
DEBUG = os.getenv("DEBUG", "true").lower() == "true"

# App database (portfolios, tags, buckets)
APP_DATABASE_PATH = os.getenv(
    "APP_DATABASE_PATH",
    str(_BASE_DIR / "brown_advisory.db")
)

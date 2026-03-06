"""
FastAPI main application for Brown Advisory Investment Analytics.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import APP_NAME, APP_VERSION, CORS_ORIGINS, DEBUG

from app.routers import metadata, screening, heatmap, correlation, base_rate, portfolio, construction, export

app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description="Investment analytics API for Brown Advisory",
    debug=DEBUG
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(metadata.router, prefix="/api/metadata", tags=["metadata"])
app.include_router(screening.router, prefix="/api/screening", tags=["screening"])
app.include_router(heatmap.router, prefix="/api/heatmap", tags=["heatmap"])
app.include_router(correlation.router, prefix="/api/correlation", tags=["correlation"])
app.include_router(base_rate.router, prefix="/api/base-rate", tags=["base-rate"])
app.include_router(portfolio.router, prefix="/api/portfolio", tags=["portfolio"])
app.include_router(construction.router, prefix="/api/construction", tags=["construction"])
app.include_router(export.router, prefix="/api/export", tags=["export"])


@app.get("/")
async def root():
    return {
        "name": APP_NAME,
        "version": APP_VERSION,
        "status": "operational",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}

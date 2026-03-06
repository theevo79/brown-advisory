"""Export endpoints — PDF tear sheet generation."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import List, Dict
from app.services.export_service import ExportService

router = APIRouter()


class TearSheetRequest(BaseModel):
    holdings: List[Dict] = Field(..., description="List of {ticker, weight} dicts")
    sections: List[str] = Field(
        default=["summary", "sectors", "countries", "holdings"],
        description="Sections to include"
    )


@router.post("/tearsheet")
async def generate_tearsheet(request: TearSheetRequest):
    """Generate a PDF tear sheet for a portfolio."""
    service = ExportService()
    try:
        pdf_bytes = service.generate_tearsheet(request.holdings, request.sections)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=tearsheet.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export error: {str(e)}")
    finally:
        service.close()

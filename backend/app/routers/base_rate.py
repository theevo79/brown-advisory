"""Base Rate endpoints - peer comparison and distribution analysis."""

import json
import sqlite3
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.models.base_rate import BaseRateRequest, BaseRateResponse
from app.services.base_rate_service import BaseRateService
from app.config import APP_DATABASE_PATH

router = APIRouter()


@router.post("/analyze", response_model=BaseRateResponse)
async def analyze_base_rate(request: BaseRateRequest):
    """Analyze base rates for a company against peers."""
    service = BaseRateService()
    try:
        result = service.analyze(request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Base rate error: {str(e)}")
    finally:
        service.close()


# --- Saved Peer Groups (3e) ---

class PeerGroupCreate(BaseModel):
    name: str
    tickers: List[str]


class PeerGroupResponse(BaseModel):
    id: int
    name: str
    tickers: List[str]
    created_at: Optional[str] = None


def _get_app_db():
    conn = sqlite3.connect(APP_DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@router.get("/peer-groups")
async def list_peer_groups():
    conn = _get_app_db()
    rows = conn.execute("SELECT * FROM saved_peer_groups ORDER BY name").fetchall()
    conn.close()
    return [
        {"id": r["id"], "name": r["name"], "tickers": json.loads(r["tickers"]), "created_at": r["created_at"]}
        for r in rows
    ]


@router.post("/peer-groups")
async def create_peer_group(body: PeerGroupCreate):
    conn = _get_app_db()
    try:
        conn.execute(
            "INSERT INTO saved_peer_groups (name, tickers) VALUES (?, ?)",
            (body.name, json.dumps(body.tickers))
        )
        conn.commit()
        row = conn.execute("SELECT * FROM saved_peer_groups WHERE name = ?", (body.name,)).fetchone()
        conn.close()
        return {"id": row["id"], "name": row["name"], "tickers": json.loads(row["tickers"]), "created_at": row["created_at"]}
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail=f"Peer group '{body.name}' already exists")


@router.put("/peer-groups/{group_id}")
async def update_peer_group(group_id: int, body: PeerGroupCreate):
    conn = _get_app_db()
    conn.execute(
        "UPDATE saved_peer_groups SET name = ?, tickers = ?, updated_at = datetime('now') WHERE id = ?",
        (body.name, json.dumps(body.tickers), group_id)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM saved_peer_groups WHERE id = ?", (group_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Peer group not found")
    return {"id": row["id"], "name": row["name"], "tickers": json.loads(row["tickers"]), "created_at": row["created_at"]}


@router.delete("/peer-groups/{group_id}")
async def delete_peer_group(group_id: int):
    conn = _get_app_db()
    conn.execute("DELETE FROM saved_peer_groups WHERE id = ?", (group_id,))
    conn.commit()
    conn.close()
    return {"ok": True}

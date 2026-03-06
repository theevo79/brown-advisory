"""
App database client for Brown Advisory app-specific data.
Manages portfolios, tags, buckets in brown_advisory.db.
"""

import sqlite3
from app.config import APP_DATABASE_PATH


class AppDatabase:
    def __init__(self):
        self.db_path = APP_DATABASE_PATH
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def _init_db(self):
        conn = self._get_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS portfolios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS portfolio_holdings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                portfolio_id INTEGER NOT NULL,
                ticker TEXT NOT NULL,
                weight REAL,
                shares REAL,
                FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS custom_buckets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL DEFAULT 'custom',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS bucket_assignments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bucket_id INTEGER NOT NULL,
                ticker TEXT NOT NULL,
                FOREIGN KEY (bucket_id) REFERENCES custom_buckets(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                colour TEXT DEFAULT '#163963'
            );

            CREATE TABLE IF NOT EXISTS ticker_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tag_id INTEGER NOT NULL,
                ticker TEXT NOT NULL,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );
        """)
        conn.commit()
        conn.close()

    def execute(self, sql, params=None):
        conn = self._get_conn()
        cursor = conn.cursor()
        if params:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)
        conn.commit()
        lastrowid = cursor.lastrowid
        conn.close()
        return lastrowid

    def fetchone(self, sql, params=None):
        conn = self._get_conn()
        cursor = conn.cursor()
        if params:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)
        row = cursor.fetchone()
        conn.close()
        return dict(row) if row else None

    def fetchall(self, sql, params=None):
        conn = self._get_conn()
        cursor = conn.cursor()
        if params:
            cursor.execute(sql, params)
        else:
            cursor.execute(sql)
        rows = cursor.fetchall()
        conn.close()
        return [dict(row) for row in rows]


_app_db = None

def get_app_db():
    global _app_db
    if _app_db is None:
        _app_db = AppDatabase()
    return _app_db

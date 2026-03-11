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
                colour TEXT DEFAULT '#163963',
                tag_type TEXT DEFAULT 'General'
            );

            CREATE TABLE IF NOT EXISTS ticker_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tag_id INTEGER NOT NULL,
                ticker TEXT NOT NULL,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );
        """)
        conn.commit()

        # Migration: add tag_type column if missing
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(tags)")
        cols = [row[1] for row in cursor.fetchall()]
        if 'tag_type' not in cols:
            conn.execute("ALTER TABLE tags ADD COLUMN tag_type TEXT DEFAULT 'General'")
            conn.commit()

        # Seed BAIV portfolio if database is empty
        cursor.execute("SELECT COUNT(*) FROM portfolios")
        if cursor.fetchone()[0] == 0:
            self._seed_baiv(conn)

        conn.close()

    def _seed_baiv(self, conn):
        """Seed the BA International Value Select ETF portfolio."""
        cursor = conn.cursor()

        # Create BAIV portfolio
        cursor.execute(
            "INSERT INTO portfolios (name) VALUES (?)",
            ("BA International Value Select ETF (BAIV)",)
        )
        portfolio_id = cursor.lastrowid

        # Holdings data
        holdings = [
            ("2670.TSE", 2.18, 75200.0), ("ABN.AS", 1.5, 26508.0),
            ("ADEN.SW", 2.11, 44086.0), ("AGS.BR", 0.98, 7896.0),
            ("AIBG.LSE", 2.33, 127840.0), ("ABF.LSE", 1.99, 44368.0),
            ("AMV0.XETRA", 1.39, 17766.0), ("SAN.MC", 1.4, 70218.0),
            ("BIRG.IR", 1.42, 44932.0), ("BARC.LSE", 1.84, 189222.0),
            ("BAS.XETRA", 1.54, 16356.0), ("BNP.PA", 1.89, 10528.0),
            ("BNR.XETRA", 2.2, 23406.0), ("BTI.US", 2.72, 26132.0),
            ("BLND.LSE", 1.46, 159894.0), ("BT-A.LSE", 1.03, 207928.0),
            ("BRBY.LSE", 1.44, 54520.0), ("CON.XETRA", 1.32, 9964.0),
            ("1878.TSE", 1.56, 37600.0), ("DSY.PA", 1.68, 42958.0),
            ("DCC.LSE", 1.92, 16826.0), ("4324.TSE", 1.87, 56400.0),
            ("EDEN.PA", 2.32, 59314.0), ("EVK.XETRA", 1.42, 49632.0),
            ("FDJU.PA", 2.12, 39856.0), ("FME.XETRA", 2.41, 29328.0),
            ("GFC.PA", 1.49, 9776.0), ("HEN3.XETRA", 2.31, 14852.0),
            ("ICLR.US", 3.26, 16920.0), ("IMB.LSE", 1.79, 23500.0),
            ("7182.TSE", 1.82, 56400.0), ("AD.AS", 2.06, 24158.0),
            ("LAND.LSE", 1.71, 116748.0), ("MICC.AS", 3.22, 117500.0),
            ("8725.TSE", 1.33, 28200.0), ("NICE.US", 2.35, 10246.0),
            ("PBR-A.US", 1.67, 57528.0), ("PRU.LSE", 2.0, 78678.0),
            ("RBI.VI", 1.88, 24158.0), ("RAND.AS", 2.09, 37412.0),
            ("RNO.PA", 1.36, 22936.0), ("REP.MC", 1.73, 40044.0),
            ("RICHT.BUD", 1.94, 31866.0), ("SNY.US", 2.98, 37224.0),
            ("SW.PA", 1.97, 21056.0), ("8630.TSE", 1.29, 18800.0),
            ("8309.TSE", 2.23, 37600.0), ("9989.TSE", 2.14, 47000.0),
            ("UHR.SW", 1.33, 3384.0), ("TX.US", 1.44, 20492.0),
            ("VOD.LSE", 1.95, 748804.0), ("WPP.LSE", 1.93, 304560.0),
            ("7272.TSE", 1.48, 112800.0),
        ]

        cursor.executemany(
            "INSERT INTO portfolio_holdings (portfolio_id, ticker, weight, shares) VALUES (?, ?, ?, ?)",
            [(portfolio_id, t, w, s) for t, w, s in holdings]
        )

        # Structural tags
        tags = [
            ("Under threat", "#163963", "Structural"),
            ("Possible structural change", "#163963", "Structural"),
            ("No structural change", "#163963", "Structural"),
        ]
        tag_ids = {}
        for name, colour, tag_type in tags:
            cursor.execute(
                "INSERT INTO tags (name, colour, tag_type) VALUES (?, ?, ?)",
                (name, colour, tag_type)
            )
            tag_ids[name] = cursor.lastrowid

        # Tag assignments
        ticker_tags = [
            ("No structural change", ["ADEN.SW", "AMV0.XETRA", "BNP.PA", "RAND.AS", "BRBY.LSE", "DCC.LSE"]),
            ("Possible structural change", ["MICC.AS", "BTI.US", "SW.PA", "9989.TSE", "4324.TSE"]),
            ("Under threat", ["7272.TSE", "ABF.LSE", "PRU.LSE", "8725.TSE", "NICE.US", "BARC.LSE", "BNR.XETRA", "RNO.PA"]),
        ]
        for tag_name, tickers in ticker_tags:
            for ticker in tickers:
                cursor.execute(
                    "INSERT INTO ticker_tags (tag_id, ticker) VALUES (?, ?)",
                    (tag_ids[tag_name], ticker)
                )

        conn.commit()
        print("Seeded BAIV portfolio with 53 holdings and 3 structural tags")

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

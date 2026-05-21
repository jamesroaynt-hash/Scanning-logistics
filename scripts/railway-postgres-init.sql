-- ============================================================
-- Railway Postgres — first-time schema for the warehouse scanner
-- ============================================================
-- Run this once in Railway Postgres → Data tab → Query.
-- Idempotent: safe to re-run, won't lose existing data.

-- Users table (auth + audit-trail FK target).
CREATE TABLE IF NOT EXISTS public.users (
  id           SERIAL PRIMARY KEY,
  username     TEXT UNIQUE NOT NULL,
  password     TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'Trainee',
  full_name    TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scan log.
CREATE TABLE IF NOT EXISTS public.scan_records (
  id           SERIAL PRIMARY KEY,
  scan_ref     TEXT UNIQUE NOT NULL,
  tracking_no  TEXT NOT NULL,
  customer     TEXT,
  phone        TEXT,
  scan_date    TEXT NOT NULL DEFAULT (CURRENT_DATE)::TEXT,
  scan_time    TEXT NOT NULL DEFAULT (CURRENT_TIME)::TEXT,
  status       TEXT,
  courier      TEXT,
  scan_type    TEXT NOT NULL DEFAULT 'Standard'
                 CHECK (scan_type IN ('Standard','RTS')),
  scanned_by   INTEGER REFERENCES public.users(id),
  product      TEXT,
  source_tab   TEXT,
  found        BOOLEAN DEFAULT TRUE,
  duplicate    BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_records_scan_date     ON public.scan_records(scan_date);
CREATE INDEX IF NOT EXISTS idx_scan_records_tracking_no   ON public.scan_records(tracking_no);
CREATE INDEX IF NOT EXISTS idx_scan_records_scanned_date  ON public.scan_records(scanned_by, scan_date);

-- Product catalogue.
CREATE TABLE IF NOT EXISTS public.inventory (
  id             SERIAL PRIMARY KEY,
  item_id        TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  sku            TEXT UNIQUE,
  type           TEXT NOT NULL DEFAULT 'Product'
                   CHECK (type IN ('Product','Supply')),
  unit           TEXT NOT NULL DEFAULT 'pcs',
  stock          INTEGER NOT NULL DEFAULT 0,
  reorder_pt     INTEGER NOT NULL DEFAULT 200,
  cost_price     REAL DEFAULT 0,
  sell_price     REAL,
  status         TEXT NOT NULL DEFAULT 'ACTIVE'
                   CHECK (status IN ('ACTIVE','INACTIVE')),
  shipped_count  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_status ON public.inventory(status);
CREATE INDEX IF NOT EXISTS idx_inventory_name   ON public.inventory(name);

-- Pickup / restock ledger.
CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id           SERIAL PRIMARY KEY,
  item_id      TEXT NOT NULL REFERENCES public.inventory(item_id),
  action       TEXT NOT NULL
                 CHECK (action IN ('add','remove','set','adjustment')),
  qty_before   INTEGER NOT NULL,
  qty_change   INTEGER NOT NULL,
  qty_after    INTEGER NOT NULL,
  notes        TEXT,
  created_by   INTEGER REFERENCES public.users(id),
  pickup_date  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_pickup_date ON public.inventory_logs(pickup_date);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_action      ON public.inventory_logs(action);

-- Persistent Google-Sheet tab list (replaces sheet-config.json).
CREATE TABLE IF NOT EXISTS public.sheet_tabs (
  position    INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  label       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Default admin account
-- Username : admin
-- Password : ChangeMe2026!
-- IMPORTANT: change this password after first login.
-- ============================================================
INSERT INTO public.users (username, password, role)
VALUES (
  'admin',
  '$2a$10$BuOUQZRqprfAhovJbjqC7uyY4ZfL9mdojks8FHBq03eE2qFzRDE72',
  'Administrator'
)
ON CONFLICT (username) DO NOTHING;

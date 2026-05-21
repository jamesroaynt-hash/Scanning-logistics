# ◳ ParcelScan — Warehouse Parcel Scanning System

A production-ready, local barcode/QR scanning system that reads and updates
parcel data in **Google Sheets** in real time. Built for high-throughput
warehouse and courier logistics operations.

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Express
- **Database source:** Google Sheets API (v4)
- **Scanner:** `html5-qrcode` (camera) + USB keyboard-wedge support

---

## ✨ Features

| Area | What it does |
|------|--------------|
| **Scanning** | Camera scanner *and* USB barcode scanner. Always-on, auto-focused input for continuous scanning with no clicks. |
| **Real-time data** | Looks up the Tracking Number directly from Google Sheets. O(1) indexed lookups, in-memory caching to handle thousands of records without hammering the API. |
| **Result display** | Tracking #, Customer, Phone, Product, COD, Status, Date Created. |
| **Status updates** | One-tap status change (Scanned / Out for Delivery / Delivered / Returned / Failed Delivery) written straight back to the sheet. |
| **Scan history** | Timestamped log per scan with operator name and duplicate-scan warnings. |
| **Dashboard** | Scanned Today, Delivered, Returned, Failed, Out for Delivery, Pending. Auto-refreshes. |
| **UX** | Dark/light mode, large scan input, color-coded statuses, mobile responsive. |
| **Feedback** | Web-Audio success/error/duplicate beeps. Input auto-clears + re-focuses after each scan. |
| **Offline** | Last successful lookups cached locally; brief outages won't stop the floor. |
| **Export** | One-click Excel (.xlsx) and PDF reports. |
| **Search** | Manual search + filter by status / date. |
| **Security** | JWT login, hashed passwords, role permissions (admin/staff), rate limiting, credentials kept out of the repo. |

---

## 📁 Project Structure

```
warehouse-scanner/
├── backend/
│   ├── credentials/                 # <- put service-account.json here (git-ignored)
│   ├── .env.example
│   └── src/
│       ├── server.js                # Express entry point
│       ├── api/                     # Route handlers (auth, parcels)
│       ├── services/                # Google Sheets + scan-history logic
│       ├── auth/                    # Login + JWT
│       ├── middleware/              # Auth guard + error handler
│       └── utils/                   # Config + logger
└── frontend/
    └── src/
        ├── main.jsx / App.jsx
        ├── pages/                   # Login, Scan, Dashboard, Search, History
        ├── components/              # Layout, ParcelCard, StatusBadge
        ├── scanner/                 # CameraScanner + useUsbScanner hook
        ├── services/                # API client
        ├── context/                 # Auth + Theme providers
        └── utils/                   # Sound, helpers, export
```

---

## 🚀 Setup Guide

### Prerequisites
- Node.js **18+**
- A Google account
- A Google Sheet with these **exact** headers in row 1:

  `ID | Day Created | Tracking Number | Customer | Phone Number | Status | Product Name | COD`

### 1. Google Sheets API setup

1. Go to the **[Google Cloud Console](https://console.cloud.google.com/)** and create a project.
2. **APIs & Services → Library →** enable **Google Sheets API**.
3. **APIs & Services → Credentials → Create Credentials → Service account**.
   - Give it a name, click **Done**.
4. Open the service account → **Keys → Add Key → Create new key → JSON**.
   - A `.json` file downloads. Rename it to **`service-account.json`**.
5. Place that file in **`backend/credentials/service-account.json`**.
6. Open the JSON file, copy the `client_email` value.
7. **Share your Google Sheet** with that email address, giving it **Editor** access
   (just like sharing with a person).
8. Copy your Sheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_IS_THE_ID`**`/edit`

### 2. Backend

```bash
cd backend
cp .env.example .env          # then edit .env
npm install
npm run dev                   # http://localhost:5000
```

Edit `.env` and set at minimum:
```
GOOGLE_SHEET_ID=your_sheet_id
GOOGLE_SHEET_TAB=Sheet1
JWT_SECRET=run `openssl rand -hex 32` and paste here
ADMIN_PASSWORD=change_me
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Open **http://localhost:5173**, log in with the admin credentials from your
`.env` (default `admin / admin123`), and start scanning.

---

## 🔧 Environment Variables

See **`backend/.env.example`** — every variable is documented inline. Key ones:

| Variable | Purpose |
|----------|---------|
| `GOOGLE_SHEET_ID` | The sheet that holds parcel data |
| `GOOGLE_SHEET_TAB` | Tab name (default `Sheet1`) |
| `GOOGLE_CREDENTIALS_PATH` | Path to service account JSON |
| `JWT_SECRET` | Signing key — **must** be changed for production |
| `ADMIN_/STAFF_USERNAME/PASSWORD` | Seed login accounts |
| `CACHE_TTL_SECONDS` | How long sheet data is cached (default 30s) |
| `CLIENT_ORIGIN` | Allowed frontend origin(s) for CORS |

---

## 🖨️ Using Scanners

- **USB barcode scanner:** Plug it in. It behaves like a keyboard — the system
  auto-detects the rapid keystroke burst and triggers a lookup on Enter. No
  field focus needed; just scan.
- **Camera:** Click **◎ Use Camera** on the Scan page and allow camera access.
- **Manual:** Type a tracking number into the big input and press Search.

---

## 📦 Deployment

### Backend (e.g. a VM, Render, Railway, or on-prem server)
```bash
cd backend
npm install --omit=dev
NODE_ENV=production node src/server.js
# Recommended: run under pm2 ->  pm2 start src/server.js --name parcelscan-api
```

### Frontend (static hosting / nginx / Netlify / Vercel)
```bash
cd frontend
npm run build          # outputs to frontend/dist
# Serve the dist/ folder, and proxy /api -> backend host
```

For an on-prem "local desktop" install, run both with `pm2` on the warehouse
machine and open `http://localhost:5173` (or serve `dist/` via nginx on :80).

> **Production checklist:** change `JWT_SECRET` and all default passwords, set
> `NODE_ENV=production`, set `CLIENT_ORIGIN` to your real frontend URL, and keep
> `credentials/` and `.env` out of version control (already git-ignored).

---

## 🛡️ Security Notes

- Passwords are bcrypt-hashed at startup; plaintext is never compared.
- All `/api/parcels/*` routes require a valid JWT.
- Cache-clear is **admin-only**; staff history is scoped to their own scans.
- Login endpoint is rate-limited (20 attempts / 15 min) against brute force.
- The general API limiter allows 600 req/min to comfortably support rapid scanning.
- Google credentials live only in `backend/credentials/` and are git-ignored.

---

## ⚡ Performance

- Indexed (Map-based) tracking lookups → constant-time, sub-second results.
- In-memory cache means repeat scans don't re-hit the Sheets API.
- Cache auto-invalidates on any status write so data stays consistent.
- Frontend dedupes rapid duplicate camera reads (one physical scan = one lookup).

---

## 🧯 Error Handling

- Centralised Express error middleware → consistent JSON errors + correct HTTP codes.
- Missing/invalid Google credentials produce a clear, actionable message.
- Frontend falls back to offline cache when the network/Sheets is unreachable.
- Distinct audio cues: success, error (not found), and duplicate-scan warning.

---

## 🧪 Quick Test (no Google setup needed)

The backend boots and auth works without credentials — only the
Sheets-backed routes need a real sheet. Health check:
`curl http://localhost:5000/api/health`

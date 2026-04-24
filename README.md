# VCU IT Inventory Manager

A standalone, offline-first IT asset management desktop application for the **Valley Credit Union** IT department (Annapolis Valley, NS).

Built with [Tauri v2](https://tauri.app/) (Rust backend) + vanilla HTML/CSS/JS frontend + embedded SQLite database.

---

## Features

- **Dashboard** – live counts of assets by status, breakdown by type and department, warranty-expiry alerts
- **Asset list** – searchable, filterable table with one-click view / edit / delete
- **Add / Edit assets** – full form covering identification, assignment, purchase & warranty dates, notes
- **Offline-first** – zero internet dependency; all data stored locally in SQLite
- **Executable deployment** – single binary, no installation of runtimes required

### Asset fields tracked

| Field | Description |
|---|---|
| Asset Tag | Unique identifier (e.g. `VCU-001`) |
| Type | Laptop, Desktop, Monitor, Printer, Switch, Router, Server, UPS, Phone, Tablet, Other |
| Make / Model | Manufacturer and model name |
| Serial Number | Manufacturer serial |
| Assigned To | Employee name |
| Department | Organisational unit |
| Location | Physical location / room |
| Status | Active, In Storage, In Repair, Retired, Lost/Stolen |
| Purchase Date | Date of purchase |
| Warranty Expiry | Expiry date (highlighted when ≤ 90 days away) |
| Notes | Free-form notes |

---

## Prerequisites

| Tool | Version |
|---|---|
| Rust | ≥ 1.77 |
| Node.js | ≥ 18 |
| npm | ≥ 9 |

### Linux system libraries (Ubuntu/Debian)

```bash
sudo apt-get install -y \
  libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev
```

---

## Development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The installer / executable will be placed in `src-tauri/target/release/bundle/`.

---

## Data storage

The SQLite database is stored in the platform app-data directory:

| Platform | Path |
|---|---|
| Linux | `~/.local/share/ca.valleycreditunion.itinventory/inventory.db` |
| macOS | `~/Library/Application Support/ca.valleycreditunion.itinventory/inventory.db` |
| Windows | `%APPDATA%\ca.valleycreditunion.itinventory\inventory.db` |

---

## Future enhancements (from proposal)

- CSV import / export
- Role-based access control
- Reporting dashboards
- Encrypted local storage

# VCU IT Inventory Manager

A standalone, offline-first IT asset management desktop application for the **Valley Credit Union** IT department (Annapolis Valley, NS).

Built with [Tauri v2](https://tauri.app/) (Rust backend) + vanilla HTML/CSS/JS frontend + embedded SQLite database.

---

## Table of Contents

1. [Features](#features)
2. [Installing the App (End Users)](#installing-the-app-end-users)
3. [Building from Source (Developers)](#building-from-source-developers)
4. [Data Storage & Backup](#data-storage--backup)
5. [Uninstalling](#uninstalling)
6. [Asset Fields Tracked](#asset-fields-tracked)
7. [Future Enhancements](#future-enhancements)

---

## Features

- **Dashboard** – live counts of assets by status, breakdown by type and department, warranty-expiry alerts
- **Asset list** – searchable, filterable table with one-click view / edit / delete
- **Add / Edit assets** – full form covering identification, assignment, purchase & warranty dates, notes
- **Offline-first** – zero internet dependency; all data stored locally in SQLite
- **No runtime required** – ships as a self-contained Windows installer; nothing else needs to be installed

---

## Installing the App (End Users)

> **Supported platforms:** Windows 10 / 11 (64-bit)
>
> No internet connection, administrator account, or additional runtimes are required during day-to-day use.

### Step 1 – Download the installer

Go to the [**Releases**](../../releases) page and download the latest installer. Two formats are provided — use whichever you prefer:

| File | Format | Notes |
|---|---|---|
| `VCU-IT-Inventory_x.x.x_x64-setup.exe` | NSIS (`.exe`) | Recommended for most users. Simple next-next-finish wizard. |
| `VCU-IT-Inventory_x.x.x_x64_en-US.msi` | Windows Installer (`.msi`) | For IT departments that deploy via Group Policy or SCCM. |

### Step 2 – Run the installer

#### NSIS installer (`.exe`)

1. Double-click `VCU-IT-Inventory_x.x.x_x64-setup.exe`.
2. If Windows SmartScreen shows a warning, click **More info → Run anyway**. *(The app is not yet code-signed; this is expected.)*
3. Follow the installation wizard:
   - Accept the licence agreement.
   - Choose an install folder (default: `C:\Program Files\VCU IT Inventory`).
   - Click **Install**, then **Finish**.
4. A shortcut is created on the Desktop and in the Start Menu under **VCU IT Inventory**.

#### MSI installer (`.msi`)

1. Double-click `VCU-IT-Inventory_x.x.x_x64_en-US.msi`.
2. Follow the wizard prompts and click **Finish** when done.
3. For silent deployment via command line:
   ```bat
   msiexec /i VCU-IT-Inventory_x.x.x_x64_en-US.msi /quiet /norestart
   ```

### Step 3 – Launch the application

- Double-click the **VCU IT Inventory** shortcut on the Desktop, **or**
- Open the Start Menu, search for **VCU IT Inventory**, and press Enter.

The app opens directly — no login or configuration is needed on first launch. The database is created automatically.

---

## Building from Source (Developers)

Follow these steps only if you want to modify the application or produce your own build.

### Prerequisites

| Tool | Minimum version | Download |
|---|---|---|
| Rust toolchain | 1.77 | <https://rustup.rs> |
| Node.js | 18 | <https://nodejs.org> |
| npm | 9 | Included with Node.js |
| WebView2 Runtime | any | Pre-installed on Windows 10/11; otherwise <https://developer.microsoft.com/en-us/microsoft-edge/webview2/> |

> **Linux only** – install the following system libraries before proceeding:
> ```bash
> sudo apt-get install -y \
>   libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.1-dev librsvg2-dev
> ```

### 1. Clone the repository

```bash
git clone https://github.com/Anaxagorius/IT_inventory_management.git
cd IT_inventory_management
```

### 2. Install JavaScript dependencies

```bash
npm install
```

### 3. Run in development mode

```bash
npm run dev
```

This opens the app with hot-reload enabled. Changes to the frontend (`src/`) are reflected immediately; changes to the Rust backend (`src-tauri/src/`) require a restart.

### 4. Produce a production installer

```bash
npm run build
```

When the build completes, the installers are placed in:

```
src-tauri/target/release/bundle/
  nsis/   ← .exe installer
  msi/    ← .msi installer
```

---

## Data Storage & Backup

All asset data is stored in a single SQLite database file. No data is ever sent over the network.

| Platform | Database location |
|---|---|
| Windows | `%APPDATA%\ca.valleycreditunion.itinventory\inventory.db` |
| macOS | `~/Library/Application Support/ca.valleycreditunion.itinventory/inventory.db` |
| Linux | `~/.local/share/ca.valleycreditunion.itinventory/inventory.db` |

**To back up your data**, copy the `inventory.db` file to a safe location (e.g. a network share or USB drive). To restore, replace the file with your backup copy while the application is closed.

---

## Uninstalling

### Windows

1. Open **Settings → Apps → Installed apps** (Windows 11) or **Control Panel → Programs → Uninstall a program** (Windows 10).
2. Find **VCU IT Inventory** in the list and click **Uninstall**.
3. Follow the prompts.

> **Your data is not deleted automatically.** The database at `%APPDATA%\ca.valleycreditunion.itinventory\` remains on disk. Delete that folder manually if you want to remove all data.

---

## Asset Fields Tracked

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

## Future Enhancements

- CSV import / export
- Role-based access control
- Reporting dashboards
- Encrypted local storage

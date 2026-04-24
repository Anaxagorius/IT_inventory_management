use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

pub struct AppState {
    pub db: Mutex<Connection>,
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Asset {
    pub id: Option<i64>,
    pub asset_tag: String,
    pub asset_type: String,
    pub make: Option<String>,
    pub model: Option<String>,
    pub serial_number: Option<String>,
    pub assigned_to: Option<String>,
    pub department: Option<String>,
    pub location: Option<String>,
    pub status: String,
    pub purchase_date: Option<String>,
    pub warranty_expiry: Option<String>,
    pub notes: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AssetStats {
    pub total: i64,
    pub active: i64,
    pub in_storage: i64,
    pub in_repair: i64,
    pub retired: i64,
    pub lost_stolen: i64,
    pub by_type: Vec<TypeCount>,
    pub by_department: Vec<DeptCount>,
    pub expiring_warranty_soon: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TypeCount {
    pub asset_type: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeptCount {
    pub department: String,
    pub count: i64,
}

// ---------------------------------------------------------------------------
// Database migrations
// ---------------------------------------------------------------------------

// Each entry in MIGRATIONS migrates the schema from version N to N+1.
// To add a new migration, append a new SQL string to the slice.
// Never modify existing entries — always add new ones.
const MIGRATIONS: &[&str] = &[
    // v0 → v1: initial schema
    "CREATE TABLE IF NOT EXISTS assets (
         id              INTEGER PRIMARY KEY AUTOINCREMENT,
         asset_tag       TEXT    NOT NULL UNIQUE,
         asset_type      TEXT    NOT NULL,
         make            TEXT,
         model           TEXT,
         serial_number   TEXT,
         assigned_to     TEXT,
         department      TEXT,
         location        TEXT,
         status          TEXT    NOT NULL DEFAULT 'Active',
         purchase_date   TEXT,
         warranty_expiry TEXT,
         notes           TEXT,
         created_at      TEXT    DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now')),
         updated_at      TEXT    DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now'))
     );

     CREATE TRIGGER IF NOT EXISTS assets_updated_at
     AFTER UPDATE ON assets
     BEGIN
         UPDATE assets SET updated_at = strftime('%Y-%m-%d %H:%M:%S', 'now')
         WHERE id = NEW.id;
     END;",
];

fn migrate_db(conn: &mut Connection) -> SqlResult<()> {
    // These PRAGMAs must be set outside any transaction.
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    let current_version: i64 =
        conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;

    for (i, &migration_sql) in MIGRATIONS.iter().enumerate() {
        let target_version = (i + 1) as i64;
        if current_version < target_version {
            let tx = conn.transaction()?;
            tx.execute_batch(migration_sql)?;
            // user_version cannot use bound parameters; the value is an
            // integer literal computed from the loop index, not user input.
            tx.execute_batch(&format!("PRAGMA user_version = {target_version};"))?;
            tx.commit()?;
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Helper: map a row to Asset
// ---------------------------------------------------------------------------

fn row_to_asset(row: &rusqlite::Row) -> SqlResult<Asset> {
    Ok(Asset {
        id: row.get(0)?,
        asset_tag: row.get(1)?,
        asset_type: row.get(2)?,
        make: row.get(3)?,
        model: row.get(4)?,
        serial_number: row.get(5)?,
        assigned_to: row.get(6)?,
        department: row.get(7)?,
        location: row.get(8)?,
        status: row.get(9)?,
        purchase_date: row.get(10)?,
        warranty_expiry: row.get(11)?,
        notes: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_all_assets(state: State<'_, AppState>) -> Result<Vec<Asset>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, asset_tag, asset_type, make, model, serial_number,
                    assigned_to, department, location, status,
                    purchase_date, warranty_expiry, notes, created_at, updated_at
             FROM assets
             ORDER BY asset_tag ASC",
        )
        .map_err(|e| e.to_string())?;

    let assets = stmt
        .query_map([], row_to_asset)
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(assets)
}

#[tauri::command]
fn get_asset(id: i64, state: State<'_, AppState>) -> Result<Asset, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT id, asset_tag, asset_type, make, model, serial_number,
                assigned_to, department, location, status,
                purchase_date, warranty_expiry, notes, created_at, updated_at
         FROM assets WHERE id = ?1",
        params![id],
        row_to_asset,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_asset(asset: Asset, state: State<'_, AppState>) -> Result<Asset, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO assets
             (asset_tag, asset_type, make, model, serial_number,
              assigned_to, department, location, status,
              purchase_date, warranty_expiry, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            asset.asset_tag,
            asset.asset_type,
            asset.make,
            asset.model,
            asset.serial_number,
            asset.assigned_to,
            asset.department,
            asset.location,
            asset.status,
            asset.purchase_date,
            asset.warranty_expiry,
            asset.notes,
        ],
    )
    .map_err(|e| e.to_string())?;

    let new_id = db.last_insert_rowid();
    db.query_row(
        "SELECT id, asset_tag, asset_type, make, model, serial_number,
                assigned_to, department, location, status,
                purchase_date, warranty_expiry, notes, created_at, updated_at
         FROM assets WHERE id = ?1",
        params![new_id],
        row_to_asset,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_asset(asset: Asset, state: State<'_, AppState>) -> Result<Asset, String> {
    let id = asset.id.ok_or("Asset id is required for update")?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let rows = db
        .execute(
            "UPDATE assets SET
                asset_tag       = ?1,
                asset_type      = ?2,
                make            = ?3,
                model           = ?4,
                serial_number   = ?5,
                assigned_to     = ?6,
                department      = ?7,
                location        = ?8,
                status          = ?9,
                purchase_date   = ?10,
                warranty_expiry = ?11,
                notes           = ?12
             WHERE id = ?13",
            params![
                asset.asset_tag,
                asset.asset_type,
                asset.make,
                asset.model,
                asset.serial_number,
                asset.assigned_to,
                asset.department,
                asset.location,
                asset.status,
                asset.purchase_date,
                asset.warranty_expiry,
                asset.notes,
                id,
            ],
        )
        .map_err(|e| e.to_string())?;

    if rows == 0 {
        return Err(format!("No asset found with id {}", id));
    }

    db.query_row(
        "SELECT id, asset_tag, asset_type, make, model, serial_number,
                assigned_to, department, location, status,
                purchase_date, warranty_expiry, notes, created_at, updated_at
         FROM assets WHERE id = ?1",
        params![id],
        row_to_asset,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_asset(id: i64, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let rows = db
        .execute("DELETE FROM assets WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    if rows == 0 {
        return Err(format!("No asset found with id {}", id));
    }
    Ok(())
}

#[tauri::command]
fn search_assets(
    query: Option<String>,
    asset_type: Option<String>,
    status: Option<String>,
    department: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<Asset>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Build a dynamic query with LIKE for the text search
    let like_query = query
        .as_deref()
        .map(|q| format!("%{}%", q))
        .unwrap_or_else(|| "%".to_string());

    let sql = "SELECT id, asset_tag, asset_type, make, model, serial_number,
                      assigned_to, department, location, status,
                      purchase_date, warranty_expiry, notes, created_at, updated_at
               FROM assets
               WHERE (
                   asset_tag      LIKE ?1 OR
                   make           LIKE ?1 OR
                   model          LIKE ?1 OR
                   serial_number  LIKE ?1 OR
                   assigned_to    LIKE ?1 OR
                   location       LIKE ?1 OR
                   notes          LIKE ?1
               )
               AND (?2 IS NULL OR asset_type  = ?2)
               AND (?3 IS NULL OR status      = ?3)
               AND (?4 IS NULL OR department  = ?4)
               ORDER BY asset_tag ASC";

    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;

    let assets = stmt
        .query_map(
            params![like_query, asset_type, status, department],
            row_to_asset,
        )
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(assets)
}

#[tauri::command]
fn get_stats(state: State<'_, AppState>) -> Result<AssetStats, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let total: i64 = db
        .query_row("SELECT COUNT(*) FROM assets", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let count_status = |s: &str| -> Result<i64, String> {
        db.query_row(
            "SELECT COUNT(*) FROM assets WHERE status = ?1",
            params![s],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())
    };

    let active = count_status("Active")?;
    let in_storage = count_status("In Storage")?;
    let in_repair = count_status("In Repair")?;
    let retired = count_status("Retired")?;
    let lost_stolen = count_status("Lost/Stolen")?;

    // Assets whose warranty expires within 90 days
    let expiring_warranty_soon: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM assets
             WHERE warranty_expiry IS NOT NULL
               AND warranty_expiry != ''
               AND date(warranty_expiry) BETWEEN date('now') AND date('now', '+90 days')",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut type_stmt = db
        .prepare(
            "SELECT asset_type, COUNT(*) AS cnt
             FROM assets
             GROUP BY asset_type
             ORDER BY cnt DESC",
        )
        .map_err(|e| e.to_string())?;

    let by_type = type_stmt
        .query_map([], |r| {
            Ok(TypeCount {
                asset_type: r.get(0)?,
                count: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    let mut dept_stmt = db
        .prepare(
            "SELECT COALESCE(department, 'Unassigned') AS dept, COUNT(*) AS cnt
             FROM assets
             GROUP BY dept
             ORDER BY cnt DESC
             LIMIT 8",
        )
        .map_err(|e| e.to_string())?;

    let by_department = dept_stmt
        .query_map([], |r| {
            Ok(DeptCount {
                department: r.get(0)?,
                count: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(AssetStats {
        total,
        active,
        in_storage,
        in_repair,
        retired,
        lost_stolen,
        by_type,
        by_department,
        expiring_warranty_soon,
    })
}

// ---------------------------------------------------------------------------
// Report export
// ---------------------------------------------------------------------------

/// Escape a CSV field: wrap in quotes if it contains commas, quotes, or newlines.
fn csv_escape(value: &str) -> String {
    if value.contains('"') || value.contains(',') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

/// All known exportable columns in display order.
const ALL_COLUMNS: &[(&str, &str)] = &[
    ("asset_tag",       "Asset Tag"),
    ("asset_type",      "Type"),
    ("make",            "Make"),
    ("model",           "Model"),
    ("serial_number",   "Serial Number"),
    ("assigned_to",     "Assigned To"),
    ("department",      "Department"),
    ("location",        "Location"),
    ("status",          "Status"),
    ("purchase_date",   "Purchase Date"),
    ("warranty_expiry", "Warranty Expiry"),
    ("notes",           "Notes"),
    ("created_at",      "Created"),
    ("updated_at",      "Last Updated"),
];

#[tauri::command]
fn export_report(
    columns: Vec<String>,
    status: Option<String>,
    asset_type: Option<String>,
    department: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if columns.is_empty() {
        return Err("At least one column must be selected.".to_string());
    }

    // Validate requested columns against the allow-list so we never interpolate
    // arbitrary strings into SQL column names.
    let valid_cols: std::collections::HashSet<&str> =
        ALL_COLUMNS.iter().map(|(k, _)| *k).collect();
    for col in &columns {
        if !valid_cols.contains(col.as_str()) {
            return Err(format!("Unknown column: {}", col));
        }
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Always fetch all columns from the DB; we select which to show in the CSV.
    let sql = "SELECT id, asset_tag, asset_type, make, model, serial_number,
                      assigned_to, department, location, status,
                      purchase_date, warranty_expiry, notes, created_at, updated_at
               FROM assets
               WHERE (?1 IS NULL OR status      = ?1)
                 AND (?2 IS NULL OR asset_type  = ?2)
                 AND (?3 IS NULL OR department  = ?3)
               ORDER BY asset_tag ASC";

    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;

    let assets = stmt
        .query_map(params![status, asset_type, department], row_to_asset)
        .map_err(|e| e.to_string())?
        .collect::<SqlResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    // Build header row using display names for the requested columns.
    let header: Vec<String> = columns
        .iter()
        .map(|col| {
            ALL_COLUMNS
                .iter()
                .find(|(k, _)| k == col)
                .map(|(_, label)| label.to_string())
                .unwrap_or_else(|| col.clone())
        })
        .collect();

    let mut csv = header.iter().map(|h| csv_escape(h)).collect::<Vec<_>>().join(",");
    csv.push('\n');

    // Build data rows.
    for a in &assets {
        let values: Vec<String> = columns
            .iter()
            .map(|col| {
                let raw = match col.as_str() {
                    "asset_tag"       => a.asset_tag.clone(),
                    "asset_type"      => a.asset_type.clone(),
                    "make"            => a.make.clone().unwrap_or_default(),
                    "model"           => a.model.clone().unwrap_or_default(),
                    "serial_number"   => a.serial_number.clone().unwrap_or_default(),
                    "assigned_to"     => a.assigned_to.clone().unwrap_or_default(),
                    "department"      => a.department.clone().unwrap_or_default(),
                    "location"        => a.location.clone().unwrap_or_default(),
                    "status"          => a.status.clone(),
                    "purchase_date"   => a.purchase_date.clone().unwrap_or_default(),
                    "warranty_expiry" => a.warranty_expiry.clone().unwrap_or_default(),
                    "notes"           => a.notes.clone().unwrap_or_default(),
                    "created_at"      => a.created_at.clone().unwrap_or_default(),
                    "updated_at"      => a.updated_at.clone().unwrap_or_default(),
                    _                 => String::new(),
                };
                csv_escape(&raw)
            })
            .collect();
        csv.push_str(&values.join(","));
        csv.push('\n');
    }

    Ok(csv)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");
            std::fs::create_dir_all(&data_dir)
                .expect("Failed to create app data directory");

            let db_path = data_dir.join("inventory.db");
            let mut conn =
                Connection::open(&db_path).expect("Failed to open SQLite database");
            if let Err(e) = migrate_db(&mut conn) {
                eprintln!("Database migration failed: {}", e);
            }

            app.manage(AppState {
                db: Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_all_assets,
            get_asset,
            create_asset,
            update_asset,
            delete_asset,
            search_assets,
            get_stats,
            export_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

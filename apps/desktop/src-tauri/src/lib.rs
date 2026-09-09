mod app_setup;
mod clipboard;
mod storage;
mod tray;
mod window;

use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, WindowEvent};
use tauri_plugin_opener::OpenerExt;
use window::controller::apply_edge_window;

#[tauri::command]
fn persist_dropped_file(
    app: tauri::AppHandle,
    filename: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let safe_filename = Path::new(&filename)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("dropped-file");
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let directory = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("dropped-files")
        .join(unique.to_string());
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(safe_filename);
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn save_backup_file(
    app: tauri::AppHandle,
    filename: String,
    contents: String,
) -> Result<String, String> {
    let safe_filename = Path::new(&filename)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("edgemagic-backup.json");
    let safe_filename = if safe_filename.to_lowercase().ends_with(".json") {
        safe_filename.to_string()
    } else {
        format!("{safe_filename}.json")
    };
    tauri::async_runtime::spawn_blocking(move || {
        let path = app
            .path()
            .download_dir()
            .map_err(|error| error.to_string())?
            .join(safe_filename);
        let path = ensure_json_extension(path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(&path, contents).map_err(|error| error.to_string())?;
        Ok(path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn ensure_json_extension(mut path: PathBuf) -> PathBuf {
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("json"))
    {
        return path;
    }
    path.set_extension("json");
    path
}

fn resolve_managed_dropped_file(app: &tauri::AppHandle, path: &str) -> Result<PathBuf, String> {
    let managed_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("dropped-files")
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let requested = Path::new(path)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !requested.starts_with(&managed_root) || !requested.is_file() {
        return Err("Refusing to access a file outside the EdgeMagic managed cache".into());
    }
    Ok(requested)
}

#[tauri::command]
fn open_managed_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let managed_file = resolve_managed_dropped_file(&app, &path)?;
    app.opener()
        .open_path(managed_file.to_string_lossy(), None::<String>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn get_file_size(path: String) -> Result<u64, String> {
    fs::metadata(&path)
        .map(|metadata| metadata.len())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_dropped_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let requested = Path::new(&path);
    if !requested.exists() {
        return Ok(());
    }
    let canonical_path = resolve_managed_dropped_file(&app, &path)?;
    let canonical_root = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("dropped-files")
        .canonicalize()
        .map_err(|error| error.to_string())?;
    fs::remove_file(&canonical_path).map_err(|error| error.to_string())?;
    if let Some(parent) = canonical_path.parent() {
        if parent != canonical_root && parent.starts_with(&canonical_root) {
            let _ = fs::remove_dir(parent);
        }
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().app_name("EdgeMagic").build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:edgemagic.db", storage::migrations())
                .build(),
        )
        .setup(app_setup::install)
        .invoke_handler(tauri::generate_handler![
            apply_edge_window,
            save_backup_file,
            persist_dropped_file,
            open_managed_file,
            get_file_size,
            delete_dropped_file
        ])
        .on_window_event(|webview_window, event| {
            if webview_window.label() == "main" && matches!(event, WindowEvent::Focused(true)) {
                if let Some(main) = webview_window.app_handle().get_webview_window("main") {
                    let _ = window::reapply_frame(&main);
                }
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = webview_window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run EdgeMagic");
}

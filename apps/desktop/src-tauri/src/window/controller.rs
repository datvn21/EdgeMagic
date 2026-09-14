use super::{
    geometry::{self, EdgeGeometry, EdgePosition, WorkArea},
    windows_native,
};
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};
use tauri::{Manager, WebviewWindow};

static LAST_APPLIED_LAYOUT: OnceLock<Mutex<Option<AppliedLayoutCache>>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq)]
struct AppliedLayoutCache {
    mode: String,
    position: EdgePosition,
    geometry: EdgeGeometry,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyEdgeWindowRequest {
    mode: String,
    position: EdgePosition,
    monitor_id: String,
    appearance: String,
    pinned: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedEdgeWindowState {
    mode: String,
    position: EdgePosition,
    actual_monitor_id: String,
    appearance: String,
}

pub fn prepare(window: &WebviewWindow) -> Result<(), String> {
    windows_native::frameless(window)?;
    windows_native::transparent_webview(window)
}
pub fn reapply_frame(window: &WebviewWindow) -> Result<(), String> {
    windows_native::frameless(window)
}

#[tauri::command]
pub fn apply_edge_window(
    window: WebviewWindow,
    request: ApplyEdgeWindowRequest,
) -> Result<AppliedEdgeWindowState, String> {
    if !matches!(request.mode.as_str(), "collapsed" | "shelf" | "focus") {
        return Err(format!("Unsupported edge window mode: {}", request.mode));
    }
    if !matches!(request.appearance.as_str(), "dark" | "light") {
        return Err(format!("Unsupported appearance: {}", request.appearance));
    }
    let (monitor, actual_monitor_id) = select_monitor(&window, &request.monitor_id)?;
    let work = monitor.work_area();
    let canvas = geometry::calculate(
        WorkArea {
            x: work.position.x,
            y: work.position.y,
            width: work.size.width,
            height: work.size.height,
        },
        monitor.scale_factor(),
        request.position,
    );
    let geometry = geometry::bounds_for_mode(canvas, &request.mode, request.position);
    let was_visible = window.is_visible().map_err(|error| error.to_string())?;
    let next_layout = AppliedLayoutCache {
        mode: request.mode.clone(),
        position: request.position,
        geometry,
    };
    let layout_changed = should_apply_layout(&next_layout);
    if layout_changed || !was_visible {
        prepare(&window)?;
        windows_native::set_geometry(&window, geometry)?;
        // Geometry changes can cause Windows to recalculate the non-client area.
        // Reapply the frameless style before any visible frame can be painted.
        reapply_frame(&window)?;
    }
    crate::tray::set_pinned(window.app_handle(), request.pinned)?;
    if !was_visible {
        window.show().map_err(|error| error.to_string())?;
        reapply_frame(&window)?;
    }
    if layout_changed || !was_visible {
        // Frame and shape are always the final native layout operations.
        windows_native::set_region(&window, geometry, &request.mode, request.position)?;
        remember_layout(next_layout);
    }
    Ok(AppliedEdgeWindowState {
        mode: request.mode,
        position: request.position,
        actual_monitor_id,
        appearance: request.appearance,
    })
}

fn layout_cache() -> &'static Mutex<Option<AppliedLayoutCache>> {
    LAST_APPLIED_LAYOUT.get_or_init(|| Mutex::new(None))
}

fn should_apply_layout(next: &AppliedLayoutCache) -> bool {
    layout_cache()
        .lock()
        .map(|current| current.as_ref() != Some(next))
        .unwrap_or(true)
}

fn remember_layout(next: AppliedLayoutCache) {
    if let Ok(mut current) = layout_cache().lock() {
        *current = Some(next);
    }
}

fn select_monitor(
    window: &WebviewWindow,
    requested: &str,
) -> Result<(tauri::Monitor, String), String> {
    let available = window
        .available_monitors()
        .map_err(|error| error.to_string())?;
    let selected = if requested == "current" {
        window
            .current_monitor()
            .map_err(|error| error.to_string())?
    } else if requested != "primary" {
        available
            .iter()
            .find(|monitor| monitor.name().is_some_and(|name| name == requested))
            .cloned()
    } else {
        None
    };
    let monitor = selected
        .or(window
            .primary_monitor()
            .map_err(|error| error.to_string())?)
        .or(window
            .current_monitor()
            .map_err(|error| error.to_string())?)
        .or_else(|| available.into_iter().next())
        .ok_or_else(|| "No monitor available for EdgeMagic window layout.".to_string())?;
    let id = monitor
        .name()
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "primary".to_string());
    Ok((monitor, id))
}

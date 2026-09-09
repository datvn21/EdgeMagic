use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager,
};

pub struct TrayState {
    pin: tauri::menu::MenuItem<tauri::Wry>,
}

pub fn install(app: &mut App) -> tauri::Result<()> {
    let show = MenuItemBuilder::with_id("show", "Show shelf").build(app)?;
    let collapse = MenuItemBuilder::with_id("collapse", "Collapse").build(app)?;
    let pin = MenuItemBuilder::with_id("pin", "Pin / unpin shelf").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit EdgeMagic").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&show, &collapse, &pin, &settings, &quit])
        .build()?;
    app.manage(TrayState { pin: pin.clone() });
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => emit(app, serde_json::json!({ "type": "show-shelf" })),
            "collapse" => emit(app, serde_json::json!({ "type": "collapse" })),
            "pin" => emit(app, serde_json::json!({ "type": "toggle-pin" })),
            "settings" => emit(
                app,
                serde_json::json!({ "type": "focus-widget", "widgetId": "settings" }),
            ),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                emit(
                    tray.app_handle(),
                    serde_json::json!({ "type": "show-shelf" }),
                );
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

pub fn set_pinned(app: &AppHandle, pinned: bool) -> Result<(), String> {
    let state = app.state::<TrayState>();
    state
        .pin
        .set_text(if pinned { "Unpin shelf" } else { "Pin shelf" })
        .map_err(|error| error.to_string())
}

fn emit(app: &tauri::AppHandle, payload: serde_json::Value) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit("edge-window://intent", payload);
}

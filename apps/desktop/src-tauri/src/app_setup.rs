use tauri::Manager;

pub fn install(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    if let Some(main) = app.get_webview_window("main") {
        crate::window::prepare(&main)?;

        // Start the system clipboard watcher.  The guard is kept alive as
        // managed state so it is dropped (and the listener unregistered) only
        // when the app exits.
        match crate::clipboard::start(&main) {
            Ok(guard) => {
                app.manage(std::sync::Mutex::new(Some(guard)));
            }
            Err(err) => {
                eprintln!("[EdgeMagic] clipboard watcher failed to start: {err}");
            }
        }
    }
    crate::tray::install(app)?;
    Ok(())
}

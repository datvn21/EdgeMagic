use super::geometry::{EdgeGeometry, EdgePosition};
use tauri::WebviewWindow;
#[cfg(not(windows))]
use tauri::{PhysicalPosition, PhysicalSize};

#[cfg(windows)]
use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Controller2, COREWEBVIEW2_COLOR};
#[cfg(windows)]
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    Graphics::Dwm::{DwmSetWindowAttribute, DWMNCRP_DISABLED, DWMWA_NCRENDERING_POLICY},
    Graphics::Gdi::{CreateRectRgn, CreateRoundRectRgn, DeleteObject, SetWindowRgn},
    UI::Shell::{DefSubclassProc, SetWindowSubclass},
    UI::WindowsAndMessaging::{
        FindWindowExW, GetAncestor, GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GA_ROOT,
        GWL_EXSTYLE, GWL_STYLE, HWND_TOPMOST, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOOWNERZORDER, SWP_NOSIZE, SWP_NOZORDER, WM_NCACTIVATE, WM_NCCALCSIZE, WM_NCPAINT,
        WS_CAPTION, WS_EX_CLIENTEDGE, WS_EX_DLGMODALFRAME, WS_EX_WINDOWEDGE, WS_MAXIMIZEBOX,
        WS_MINIMIZEBOX, WS_SYSMENU, WS_THICKFRAME,
    },
};
#[cfg(windows)]
use windows_core::{w, Interface};

pub fn transparent_webview(window: &WebviewWindow) -> Result<(), String> {
    window
        .set_background_color(None)
        .map_err(|error| error.to_string())?;
    #[cfg(windows)]
    window
        .with_webview(|webview| unsafe {
            if let Ok(controller) = webview.controller().cast::<ICoreWebView2Controller2>() {
                let _ = controller.SetDefaultBackgroundColor(COREWEBVIEW2_COLOR {
                    R: 0,
                    G: 0,
                    B: 0,
                    A: 0,
                });
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

pub fn frameless(window: &WebviewWindow) -> Result<(), String> {
    window.set_title("").map_err(|error| error.to_string())?;
    window
        .set_decorations(false)
        .map_err(|error| error.to_string())?;
    window
        .set_shadow(false)
        .map_err(|error| error.to_string())?;
    #[cfg(windows)]
    remove_native_frame(window.hwnd().map_err(|error| error.to_string())?)?;
    Ok(())
}

#[cfg(windows)]
fn root_hwnd(hwnd: HWND) -> HWND {
    let root = unsafe { GetAncestor(hwnd, GA_ROOT) };
    if root.0.is_null() {
        hwnd
    } else {
        root
    }
}

#[cfg(windows)]
fn remove_native_frame(hwnd: HWND) -> Result<(), String> {
    let hwnd = root_hwnd(hwnd);
    let style = unsafe { GetWindowLongPtrW(hwnd, GWL_STYLE) };
    let borderless = style
        & !((WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MINIMIZEBOX | WS_MAXIMIZEBOX).0 as isize);
    let ex_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) };
    let borderless_ex =
        ex_style & !((WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_DLGMODALFRAME).0 as isize);
    unsafe {
        let _ = SetWindowSubclass(hwnd, Some(no_native_frame), 1, 0);
        SetWindowLongPtrW(hwnd, GWL_STYLE, borderless);
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, borderless_ex);
        // Prevent DWM from recreating a non-client caption/backdrop after a
        // focus or bounds update, even when the style bits are frameless.
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_NCRENDERING_POLICY,
            (&DWMNCRP_DISABLED.0 as *const i32).cast(),
            std::mem::size_of::<i32>() as u32,
        );
        SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE
                | SWP_NOSIZE
                | SWP_NOZORDER
                | SWP_NOOWNERZORDER
                | SWP_NOACTIVATE
                | SWP_FRAMECHANGED,
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(windows)]
unsafe extern "system" fn no_native_frame(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _subclass_id: usize,
    _ref_data: usize,
) -> LRESULT {
    match message {
        WM_NCCALCSIZE | WM_NCPAINT | WM_NCACTIVATE => LRESULT(0),
        _ => DefSubclassProc(hwnd, message, wparam, lparam),
    }
}

pub fn set_geometry(window: &WebviewWindow, geometry: EdgeGeometry) -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        SetWindowPos(
            root_hwnd(window.hwnd().map_err(|error| error.to_string())?),
            Some(HWND_TOPMOST),
            geometry.x,
            geometry.y,
            geometry.width as i32,
            geometry.height as i32,
            SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_FRAMECHANGED,
        )
        .map_err(|error| error.to_string())?;
    }
    #[cfg(not(windows))]
    {
        window
            .set_size(PhysicalSize::new(geometry.width, geometry.height))
            .map_err(|error| error.to_string())?;
        window
            .set_position(PhysicalPosition::new(geometry.x, geometry.y))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn set_region(
    window: &WebviewWindow,
    geometry: EdgeGeometry,
    mode: &str,
    position: EdgePosition,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        let hwnd = root_hwnd(window.hwnd().map_err(|error| error.to_string())?);
        let create_region = || unsafe {
            if mode == "collapsed" {
                CreateRectRgn(0, 0, geometry.width as i32, geometry.height as i32)
            } else {
                let corner_diameter = geometry.corner_diameter as i32;
                CreateRoundRectRgn(
                    0,
                    geometry.surface_top,
                    geometry.width as i32,
                    geometry.surface_top + geometry.surface_height as i32,
                    corner_diameter,
                    corner_diameter,
                )
            }
        };
        let root_region = create_region();
        if unsafe { SetWindowRgn(hwnd, Some(root_region), true) } == 0 {
            let _ = unsafe { DeleteObject(root_region.into()) };
            return Err("SetWindowRgn failed".to_string());
        }

        // WebView2 renders through a child DirectComposition HWND. Its visual
        // can otherwise keep a rectangular backing even when the top-level
        // HWND has a rounded region.
        if let Ok(webview_host) = unsafe {
            FindWindowExW(
                Some(hwnd),
                None,
                w!("WRY_WEBVIEW"),
                windows_core::PCWSTR::null(),
            )
        } {
            let webview_region = create_region();
            if unsafe { SetWindowRgn(webview_host, Some(webview_region), true) } == 0 {
                let _ = unsafe { DeleteObject(webview_region.into()) };
                return Err("SetWindowRgn failed for WebView2 host".to_string());
            }
        }
    }
    let _ = (window, geometry, mode, position);
    Ok(())
}

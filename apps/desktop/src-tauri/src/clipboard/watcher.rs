/// Windows clipboard watcher.
///
/// Registers the hidden EdgeMagic window as a clipboard format listener via
/// `AddClipboardFormatListener`.  Whenever any other application copies data
/// Windows posts `WM_CLIPBOARDUPDATE` (0x031D) to that window; we install a
/// Win32 subclass on the root HWND so we can intercept that message without
/// touching the existing Tauri WndProc.
///
/// On each change we read CF_UNICODETEXT, CF_HDROP, or CF_DIB/CF_DIBV5 and
/// emit the result as a Tauri event ("clipboard-changed") to the frontend.
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use windows::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    System::{
        DataExchange::{
            AddClipboardFormatListener, CloseClipboard, GetClipboardData,
            IsClipboardFormatAvailable, OpenClipboard, RemoveClipboardFormatListener,
        },
        Memory::{GlobalLock, GlobalSize, GlobalUnlock},
    },
    UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
    UI::WindowsAndMessaging::{GetAncestor, GA_ROOT},
};

const WM_CLIPBOARDUPDATE: u32 = 0x031D;
const SUBCLASS_ID: usize = 0xC1_1B;

const CF_UNICODETEXT: u32 = 13;
const CF_HDROP: u32 = 15;
const CF_DIBV5: u32 = 17;
const CF_DIB: u32 = 8;
const MAX_CLIPBOARD_IMAGE_RGBA_BYTES: usize = 25 * 1024 * 1024;

/// Payload emitted to the frontend on every clipboard change.
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ClipboardPayload {
    Text { text: String },
    FileList { paths: Vec<String> },
    Image { png_base64: String },
}

/// HWND wrapper that is Send + Sync because we only ever touch it from the
/// main thread (subclass WndProc) or during Drop, which Tauri guarantees
/// happens on the main thread.
struct SendHwnd(isize);
unsafe impl Send for SendHwnd {}
unsafe impl Sync for SendHwnd {}

impl SendHwnd {
    fn hwnd(&self) -> HWND {
        HWND(self.0 as *mut _)
    }
}

impl From<HWND> for SendHwnd {
    fn from(h: HWND) -> Self {
        SendHwnd(h.0 as isize)
    }
}

/// State shared between the WndProc subclass callback and the guard.
struct WatcherState {
    app: AppHandle,
    active: Arc<AtomicBool>,
    pending: Arc<AtomicBool>,
}

/// Start watching the system clipboard.  Returns a guard that stops the watcher
/// when dropped.  Must be called from the main thread.
pub fn start(window: &WebviewWindow) -> Result<ClipboardWatcherGuard, String> {
    let hwnd = unsafe {
        let wv_hwnd = window.hwnd().map_err(|e| e.to_string())?;
        GetAncestor(wv_hwnd, GA_ROOT)
    };

    if hwnd.is_invalid() {
        return Err("Could not get root HWND for clipboard listener".into());
    }

    let active = Arc::new(AtomicBool::new(true));
    let pending = Arc::new(AtomicBool::new(false));
    let state = Box::new(WatcherState {
        app: window.app_handle().clone(),
        active: active.clone(),
        pending: pending.clone(),
    });

    let state_ptr = Box::into_raw(state) as usize;

    unsafe {
        AddClipboardFormatListener(hwnd).map_err(|e| e.to_string())?;
        let ok: bool =
            SetWindowSubclass(hwnd, Some(clipboard_wndproc), SUBCLASS_ID, state_ptr).as_bool();
        if !ok {
            // Subclass failed – free the box and deregister listener
            drop(Box::from_raw(state_ptr as *mut WatcherState));
            let _ = RemoveClipboardFormatListener(hwnd);
            return Err("SetWindowSubclass failed".into());
        }
    }

    Ok(ClipboardWatcherGuard {
        hwnd: SendHwnd::from(hwnd),
        active,
        pending,
    })
}

/// Dropping this guard removes the clipboard listener and subclass.
pub struct ClipboardWatcherGuard {
    hwnd: SendHwnd,
    active: Arc<AtomicBool>,
    pending: Arc<AtomicBool>,
}

impl Drop for ClipboardWatcherGuard {
    fn drop(&mut self) {
        self.active.store(false, Ordering::SeqCst);
        self.pending.store(false, Ordering::SeqCst);
        let hwnd = self.hwnd.hwnd();
        unsafe {
            let _ = RemoveClipboardFormatListener(hwnd);
            // RemoveWindowSubclass triggers one final WndProc call that
            // lets us free the state_ptr box cleanly.
            let _ = RemoveWindowSubclass(hwnd, Some(clipboard_wndproc), SUBCLASS_ID);
        }
    }
}

/// Win32 subclass procedure that intercepts WM_CLIPBOARDUPDATE.
unsafe extern "system" fn clipboard_wndproc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _subclass_id: usize,
    state_ptr: usize,
) -> LRESULT {
    if message == WM_CLIPBOARDUPDATE && state_ptr != 0 {
        let state = &*(state_ptr as *const WatcherState);
        if state.active.load(Ordering::SeqCst) && !state.pending.swap(true, Ordering::SeqCst) {
            let app = state.app.clone();
            let active = state.active.clone();
            let pending = state.pending.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let payload = read_clipboard();
                pending.store(false, Ordering::SeqCst);
                if active.load(Ordering::SeqCst) {
                    if let Some(payload) = payload {
                        let _ = app.emit("clipboard-changed", payload);
                    }
                }
            });
        }
    }

    DefSubclassProc(hwnd, message, wparam, lparam)
}

// ---------------------------------------------------------------------------
// Clipboard reading
// ---------------------------------------------------------------------------

fn read_clipboard() -> Option<ClipboardPayload> {
    unsafe {
        if OpenClipboard(None).is_err() {
            return None;
        }
        let result = read_clipboard_inner();
        let _ = CloseClipboard();
        result
    }
}

unsafe fn read_clipboard_inner() -> Option<ClipboardPayload> {
    // 1. Unicode text
    if IsClipboardFormatAvailable(CF_UNICODETEXT).is_ok() {
        if let Ok(handle) = GetClipboardData(CF_UNICODETEXT) {
            let hglobal = windows::Win32::Foundation::HGLOBAL(handle.0);
            let ptr = GlobalLock(hglobal) as *const u16;
            if !ptr.is_null() {
                let size = GlobalSize(hglobal);
                let len = size / 2;
                let slice = std::slice::from_raw_parts(ptr, len);
                let end = slice.iter().position(|&c| c == 0).unwrap_or(slice.len());
                let text = String::from_utf16_lossy(&slice[..end]);
                let _ = GlobalUnlock(hglobal);
                if !text.trim().is_empty() {
                    return Some(ClipboardPayload::Text { text });
                }
            }
        }
    }

    // 2. File drop list (CF_HDROP)
    if IsClipboardFormatAvailable(CF_HDROP).is_ok() {
        if let Some(paths) = read_hdrop() {
            if !paths.is_empty() {
                return Some(ClipboardPayload::FileList { paths });
            }
        }
    }

    // 3. Image (CF_DIBV5 preferred, fall back to CF_DIB)
    let img_format = if IsClipboardFormatAvailable(CF_DIBV5).is_ok() {
        Some(CF_DIBV5)
    } else if IsClipboardFormatAvailable(CF_DIB).is_ok() {
        Some(CF_DIB)
    } else {
        None
    };
    if let Some(fmt) = img_format {
        if let Some(png_base64) = read_dib_as_png_base64(fmt) {
            return Some(ClipboardPayload::Image { png_base64 });
        }
    }

    None
}

unsafe fn read_hdrop() -> Option<Vec<String>> {
    use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};

    let handle = GetClipboardData(CF_HDROP).ok()?;
    let hglobal = windows::Win32::Foundation::HGLOBAL(handle.0);
    let hdrop = HDROP(GlobalLock(hglobal));
    if hdrop.0.is_null() {
        return None;
    }

    let count = DragQueryFileW(hdrop, u32::MAX, None);
    let mut paths = Vec::with_capacity(count as usize);
    for i in 0..count {
        let needed = DragQueryFileW(hdrop, i, None) as usize + 1;
        let mut buf = vec![0u16; needed];
        DragQueryFileW(hdrop, i, Some(&mut buf));
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        paths.push(String::from_utf16_lossy(&buf[..end]).to_string());
    }
    let _ = GlobalUnlock(hglobal);
    Some(paths)
}

unsafe fn read_dib_as_png_base64(format: u32) -> Option<String> {
    let handle = GetClipboardData(format).ok()?;
    let hglobal = windows::Win32::Foundation::HGLOBAL(handle.0);
    let ptr = GlobalLock(hglobal) as *const u8;
    if ptr.is_null() {
        return None;
    }
    let size = GlobalSize(hglobal);
    let bytes = std::slice::from_raw_parts(ptr, size);
    let result = dib_to_png_base64(bytes);
    let _ = GlobalUnlock(hglobal);
    result
}

// ---------------------------------------------------------------------------
// DIB → PNG conversion (self-contained, no extra crate needed)
// ---------------------------------------------------------------------------

fn dib_to_png_base64(dib: &[u8]) -> Option<String> {
    if dib.len() < 40 {
        return None;
    }

    let header_size = u32::from_le_bytes(dib[0..4].try_into().ok()?) as usize;
    let width = i32::from_le_bytes(dib[4..8].try_into().ok()?) as u32;
    let height_raw = i32::from_le_bytes(dib[8..12].try_into().ok()?);
    let height = height_raw.unsigned_abs();
    let bit_count = u16::from_le_bytes(dib[14..16].try_into().ok()?);
    let compression = u32::from_le_bytes(dib[16..20].try_into().ok()?);

    // Only handle uncompressed 24-bit or 32-bit DIBs
    if compression != 0 && compression != 3 {
        return None;
    }
    if bit_count != 24 && bit_count != 32 {
        return None;
    }

    let bytes_per_pixel = (bit_count / 8) as usize;
    let row_stride = (width as usize * bytes_per_pixel + 3) & !3;
    let pixel_offset = header_size;

    if dib.len() < pixel_offset + row_stride * height as usize {
        return None;
    }

    let bottom_up = height_raw > 0;
    let w = width as usize;
    let h = height as usize;
    if w.checked_mul(h)?.checked_mul(4)? > MAX_CLIPBOARD_IMAGE_RGBA_BYTES {
        return None;
    }
    let pixels = &dib[pixel_offset..];

    let mut rgba = vec![0u8; w * h * 4];
    for row in 0..h {
        let src_row = if bottom_up { h - 1 - row } else { row };
        let src = &pixels[src_row * row_stride..src_row * row_stride + w * bytes_per_pixel];
        let dst = &mut rgba[row * w * 4..(row + 1) * w * 4];
        for x in 0..w {
            let s = &src[x * bytes_per_pixel..];
            dst[x * 4] = s[2]; // R
            dst[x * 4 + 1] = s[1]; // G
            dst[x * 4 + 2] = s[0]; // B
            dst[x * 4 + 3] = if bytes_per_pixel == 4 { s[3] } else { 255 };
        }
    }

    let png = encode_rgba_as_png(w as u32, h as u32, &rgba)?;
    Some(base64::engine::general_purpose::STANDARD.encode(&png))
}

fn encode_rgba_as_png(width: u32, height: u32, rgba: &[u8]) -> Option<Vec<u8>> {
    let w = width as usize;
    let h = height as usize;
    if rgba.len() != w * h * 4 {
        return None;
    }

    let mut png = Vec::new();
    png.extend_from_slice(&[137, 80, 78, 71, 13, 10, 26, 10]);

    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.push(8); // bit depth
    ihdr.push(6); // colour type: RGBA
    ihdr.extend_from_slice(&[0, 0, 0]);
    write_png_chunk(&mut png, b"IHDR", &ihdr);

    // Build filtered rows (filter type 0 = None)
    let mut filtered = Vec::with_capacity(h * (1 + w * 4));
    for row in 0..h {
        filtered.push(0);
        filtered.extend_from_slice(&rgba[row * w * 4..(row + 1) * w * 4]);
    }

    let idat_data = zlib_store(&filtered);
    write_png_chunk(&mut png, b"IDAT", &idat_data);
    write_png_chunk(&mut png, b"IEND", &[]);
    Some(png)
}

fn write_png_chunk(out: &mut Vec<u8>, tag: &[u8; 4], data: &[u8]) {
    out.extend_from_slice(&(data.len() as u32).to_be_bytes());
    out.extend_from_slice(tag);
    out.extend_from_slice(data);
    out.extend_from_slice(&crc32(tag, data).to_be_bytes());
}

fn zlib_store(data: &[u8]) -> Vec<u8> {
    const MAX_BLOCK: usize = 65535;
    let num_blocks = (data.len() + MAX_BLOCK - 1).max(1) / MAX_BLOCK.max(1);
    let num_blocks = num_blocks.max(1);
    let mut out = Vec::new();
    out.extend_from_slice(&[0x78, 0x01]); // zlib header

    let mut pos = 0;
    for block_idx in 0..num_blocks {
        let end = (pos + MAX_BLOCK).min(data.len());
        let block = &data[pos..end];
        let last = block_idx == num_blocks - 1;
        out.push(u8::from(last)); // BFINAL | BTYPE=00
        let len = block.len() as u16;
        out.extend_from_slice(&len.to_le_bytes());
        out.extend_from_slice(&(!len).to_le_bytes());
        out.extend_from_slice(block);
        pos = end;
    }

    out.extend_from_slice(&adler32(data).to_be_bytes());
    out
}

fn adler32(data: &[u8]) -> u32 {
    const MOD: u32 = 65521;
    let (mut a, mut b) = (1u32, 0u32);
    for &byte in data {
        a = (a + byte as u32) % MOD;
        b = (b + a) % MOD;
    }
    (b << 16) | a
}

fn crc32(tag: &[u8; 4], data: &[u8]) -> u32 {
    static TABLE: std::sync::OnceLock<[u32; 256]> = std::sync::OnceLock::new();
    let table = TABLE.get_or_init(|| {
        let mut t = [0u32; 256];
        for (n, entry) in t.iter_mut().enumerate() {
            let mut c = n as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 {
                    0xEDB88320 ^ (c >> 1)
                } else {
                    c >> 1
                };
            }
            *entry = c;
        }
        t
    });
    let mut crc = 0xFFFF_FFFFu32;
    for &b in tag.iter().chain(data.iter()) {
        crc = table[((crc ^ b as u32) & 0xFF) as usize] ^ (crc >> 8);
    }
    crc ^ 0xFFFF_FFFF
}

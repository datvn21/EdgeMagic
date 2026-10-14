# EdgeMagic WinUI 3

The WinUI app is an early Windows replacement for the Tauri desktop shell. It reads the existing SQLite database at `%APPDATA%\app.edgemagic.desktop\edgemagic.db` and currently provides:

- Edge shelf positioning, monitor selection, auto-collapse, pinning, tray menu, and `Ctrl+Space`.
- Inbox captures for pasted/copied text and links, plus files dropped from Explorer.
- Clipboard image capture copied into the existing app-data folder with an attachment record.
- Notes create, edit, and soft-delete actions; to-do create, complete, and soft-delete actions.
- Reminders and saved links with soft-delete actions.
- Chrome/Edge bookmark JSON import, merged by URL and stored in the existing bookmark setting; links open in the default browser.
- A setting to turn automatic clipboard text capture on or off.
- Windows reminder notifications while the app process is running, including when the shelf is collapsed to the tray.
- JSON backup export/import using the existing EdgeMagic backup format.
- SQLite triggers that enqueue notes, tasks, reminders, saved links, and captures into the existing `sync_queue`; Settings shows pending/failed queue size.

## Run from source

Use Windows with the .NET 10 SDK. Open the existing Tauri app once so its database exists, then close it before starting WinUI. Both apps must not write to the same database at the same time.

```powershell
powershell -ExecutionPolicy Bypass -File apps/winui/build-package.ps1
```

Install the generated MSIX using the `Install.ps1` next to it, then launch **EdgeMagic** from Start. The app is packaged with its Windows App SDK runtime; launching `EdgeMagic.App.exe` directly from `bin` will not work reliably because it has no package identity. The install script will ask before trusting the local development certificate.

To compile without creating a package:

```powershell
dotnet build apps/winui/EdgeMagic.App/EdgeMagic.App.csproj
```

To create or refresh a locally signed x64 MSIX package:

```powershell
powershell -ExecutionPolicy Bypass -File apps/winui/build-package.ps1
```

The script creates a local development signing certificate and puts the public `.cer` beside the package. Run the generated `Install.ps1` in the package folder to sideload it; Windows will ask before trusting that certificate. This certificate is for local development only, not public distribution. A production release needs an organization/store publisher certificate.

The app refuses to create a new database if the Tauri database is missing. Notes, tasks, reminders, and saved links use the same tables as the existing app; captures are stored in its `items` and `item_search` tables. Deletes set `deleted_at` and preserve the row.

## Not ready to replace the released app

The WinUI build is not yet at feature parity. Remaining work includes broader settings migration and persistence, reminders when the app process is not running, an actual sync provider/worker, keyboard/accessibility review, transparent native window corners, data compatibility checks on a separate database copy, and MSIX packaging and upgrade validation. Continue to keep the Tauri app available until those are complete.

Backups are not encrypted. They include attachment metadata but do not copy the attachment files themselves; retain the original app-data folder when moving machines or reinstalling.

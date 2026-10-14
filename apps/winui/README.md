# WinUI 3 migration (in progress)

The native shell supports left/right edge placement, monitor selection, pinning, auto-collapse, tray controls, and Ctrl+Space. Notes and Todo read and write the existing `%APPDATA%\app.edgemagic.desktop\edgemagic.db`; deletes are soft deletes. The app asks the user to close the legacy `edgemagic.exe` before opening the shared database.

Build on a Windows development machine with .NET 10 SDK and Windows App SDK support:

```powershell
dotnet build apps/winui/EdgeMagic.App/EdgeMagic.App.csproj
dotnet run --project apps/winui/EdgeMagic.App/EdgeMagic.App.csproj
```

The migration is not at feature parity: capture/inbox, reminders, saved items, bookmarks, settings, sync, true window transparency/rounded native region, packaging, and data compatibility validation remain. Keep the Tauri app until those workflows and upgrade behavior have been verified.

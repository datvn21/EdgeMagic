# WinUI 3 migration plan

## Goal

Replace the Tauri + React desktop shell with a native WinUI 3 app for Windows while preserving EdgeMagic's local data and core workflows. This is a Windows-only migration; the UI and TypeScript/React-dependent code will be rewritten in C# and XAML.

## Current shape

- `apps/desktop/src/ui` contains the React widgets and edge-panel state.
- `apps/desktop/src/platform/desktop-platform.ts` is the boundary to Tauri APIs.
- `apps/desktop/src-tauri/src/window` implements frameless, transparent, topmost, edge-positioned window behavior with Win32 calls.
- Persistence uses `sqlite:edgemagic.db`; schema and migrations live in `packages/core/src/storage` and `apps/desktop/src-tauri/src/storage`.
- Domain types, module contracts, capture normalization, and much of the business logic live in the TypeScript packages. They are not directly reusable from a native .NET UI.

## Target structure

- `apps/winui/EdgeMagic.sln` — WinUI 3 app and its .NET projects.
- `EdgeMagic.App` — XAML views, navigation, tray/lifecycle integration, and native edge window.
- `EdgeMagic.Core` — domain models, capture routing, productivity rules, settings, and sync queue.
- `EdgeMagic.Storage` — SQLite connection, repositories, and schema migrations.
- Keep the current Tauri app buildable during migration; remove it only after the WinUI app reaches feature parity and data migration is verified.

## Phases

1. **Spike the native shell.** Create a minimal WinUI 3 window and prove edge anchoring, collapsed/expanded/focus bounds, topmost behavior, transparency/rounded region, monitor/DPI changes, and tray-driven show/hide. Use WinUI `Window`/`AppWindow` where possible and HWND interop only for behavior those APIs do not cover. Stop and reassess if the edge-panel behavior cannot be made reliable without a large native workaround.
2. **Lock down data compatibility.** Identify the installed app's actual database and attachment paths. Open a copy with the new SQLite provider, preserve existing tables and migration history, and test upgrades on copies of representative databases. Do not rename or replace the production database until compatibility is proven. Preserve backups and attachment paths.
3. **Port core services.** Port the shared item, attachment, search, settings, capture-normalization, and sync-queue contracts to C#. Keep SQLite as the source of truth. Port module behavior behind a small in-process interface only where the current app uses it; defer a plugin marketplace/runtime.
4. **Port workflows in slices.** Implement shell/settings first, then capture inbox and clipboard/file drops, then Notes/Todo/Reminder, then Saved/Bookmarks and sync/backup controls. Reuse the design tokens and interaction behavior from `design.md`, translating them into XAML styles and WinUI controls.
5. **Complete Windows integrations.** Add global shortcut, notifications, startup-at-login, deep links, file open/reveal, screenshot capability reporting, and multi-monitor settings. Keep capabilities explicit where Windows support is incomplete.
6. **Ship and retire Tauri.** Build an MSIX package and CI release artifact; validate clean install, upgrade, uninstall/reinstall, startup, and data retention. Remove the Tauri app and its scripts only after the parity checklist passes.

## Data compatibility requirements

- Preserve existing SQLite tables, FTS search data, schema migration records, and sync queue.
- Confirm the current OS-specific app-data location from the installed Tauri build before implementing import/open logic; `sqlite:edgemagic.db` alone does not establish the on-disk path.
- Keep existing attachment files reachable. If the new app must move data, perform a one-time copy with validation and retain the source until success is confirmed.
- Ensure both apps cannot write to the same database simultaneously during any transition period.

## Feature parity checklist

- [ ] Edge trigger, collapse/expand/focus, pinned state, frameless/topmost behavior
- [ ] Correct edge position and work-area geometry across monitors and DPI scales
- [ ] Clipboard text, image, and file-list capture; drag/drop capture and routing
- [ ] Inbox, notes, todos, reminders, saved items, bookmarks, settings
- [ ] SQLite search, attachments, soft delete, import/export, and sync queue
- [ ] Tray menu, global shortcut, notifications, startup, deep links, file actions
- [ ] Keyboard navigation, visible focus, theme, density, and reduced-motion behavior
- [ ] Existing user database opens without data loss; backup restore works
- [ ] MSIX clean install and upgrade preserve user data

## Main risks and decisions

- **Window behavior is the riskiest part.** Validate it before porting widgets; AppWindow is based on HWND, so native interop remains available, but the current custom non-client handling needs a focused prototype. [Microsoft windowing overview](https://learn.microsoft.com/en-us/windows/apps/develop/ui/windowing-overview)
- **The core is TypeScript, not a language-neutral library.** A native UI means porting business logic to C#; keeping the React UI inside WebView would reduce porting work but would not deliver a native WinUI interface.
- **Database path and migration ownership must be confirmed.** Tauri plugin SQL migrations and the TypeScript core migrations are separate code paths; determine which schema is actually shipped before porting migration logic.
- **Distribution:** use single-project MSIX as the initial target. Revisit unpackaged distribution only if release requirements call for it. [Microsoft single-project MSIX](https://learn.microsoft.com/en-us/windows/apps/windows-app-sdk/single-project-msix)

## First milestone

Deliver a small WinUI 3 spike that opens beside the existing app and demonstrates edge positioning, monitor/DPI geometry, topmost behavior, tray show/hide, and opening a copied production-format database read-only. Decide whether to proceed based on those results before porting the full UI.

## Progress (2026-10-11)

- [x] Create the WinUI 3 app scaffold and compile it with .NET 10.
- [x] Implement edge placement, monitor selection, topmost window, pin/collapse, tray menu, and Ctrl+Space.
- [x] Port basic Notes/Todo list, create, toggle, and soft-delete against the existing app-data DB path.
- [ ] Validate compatibility against a copy of an actual installed database before relying on writes.
- [ ] Finish transparent/rounded window behavior and remaining workflows in the parity checklist.

The current implementation blocks Notes/Todo access while the legacy `edgemagic.exe` process is running. The migration is still in progress; this branch is not ready to replace or remove the Tauri app.

## Progress (2026-10-14)

- Expanded the WinUI surface to Inbox, Notes, To do, Reminders, Saved links, and Settings.
- Added persisted text/link captures, Explorer file drops with attachment records, note/task/reminder/saved-item operations, and automatic clipboard text capture with an enable switch.
- Reused the existing `edgemagic.edge-settings` JSON row for clipboard capture and shelf-position preferences.
- Added Chrome/Edge Chromium bookmark JSON import using the existing `edgemagic.browser-bookmarks` setting, URL deduplication, clear, and open-in-browser actions.
- Added backup file pickers for the existing EdgeMagic JSON backup format. The UI warns that backups are unencrypted and attachment files are not copied.
- Added idempotent SQLite triggers that enqueue local item and productivity changes in the existing `sync_queue`; Settings reports pending and failed entries. No sync provider or worker is enabled yet.
- Added clipboard image capture to a managed app-data attachment file and Windows App Notifications for due reminders while the app process is running.
- Confirmed the expected `%APPDATA%\app.edgemagic.desktop\edgemagic.db` file exists and, in a read-only inspection, contains the released SQLx migration records and required tables. No user database rows were changed during that inspection.
- `dotnet build apps/winui/EdgeMagic.App/EdgeMagic.App.csproj --no-restore` succeeds with zero warnings and errors.
- The legacy `edgemagic` process is currently running, so the WinUI app has not been launched against the real database. It intentionally refuses concurrent access.

Still required before replacing Tauri: test writes on a separate copy of the actual database; finish reminders when the app is not running, sync provider/worker, settings parity, accessibility, true transparent window regions, and MSIX install/upgrade validation. Keep the Tauri app available.

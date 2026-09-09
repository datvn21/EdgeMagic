<div align="center">

<br/>

<img src="./MagicEdge.svg" width="80" height="80" alt="EdgeMagic logo" />

<h1>EdgeMagic</h1>

<p>A slim, local-first magic edge panel for your desktop.<br/>Drop anything. Get it back instantly. Stay offline.</p>

<p>
  <a href="https://github.com/datvn21/EdgeMagic/releases"><img alt="GitHub release" src="https://img.shields.io/github/v/release/datvn21/EdgeMagic?style=flat-square&color=0d9488" /></a>
  <a href="https://github.com/datvn21/EdgeMagic/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-0d9488?style=flat-square" /></a>
  <a href="https://github.com/datvn21/EdgeMagic/actions"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/datvn21/EdgeMagic/ci.yml?style=flat-square&label=ci" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-blue?style=flat-square" />
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-v2-24c8db?style=flat-square&logo=tauri&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white" />
</p>

<br/>

</div>

---

## What is EdgeMagic?

EdgeMagic lives at the edge of your screen - a compact, always-available panel that captures text, links, files and clipboard content and turns them into structured local items. No tabs, no bloat. Just a focused set of small widgets with a single capture loop:

```
Capture → Classify → Act → Retrieve
```

Hover the edge, drop something in, and move on. Keep it in your local shelf, with universal search planned for a later roadmap phase.

---

## Features

| Widget | Description |
|---|---|
| 📥 **Capture Inbox** | Recent clipboard, URL, text, image and file captures |
| 📝 **Notes** | Quick Markdown/plain-text notes; dropped content becomes note content |
| ✅ **Todo** | Lightweight tasks; dropped content becomes a task title |
| 🔔 **Reminder** | Local scheduled reminders with configurable defaults |
| 🔖 **Saved** | Durable links and file references |
| ⚙️ **Settings** | Edge position, monitor, theme, capture and backup controls |

**Core properties:**

- 🔒 **Local-first** - SQLite is the source of truth; works fully offline
- 🧩 **Module system** - Clipboard, sync and future capability modules are independently loaded
- 🎨 **Dark & Light** - Monochrome minimal design with deep teal accent
- ⌨️ **Keyboard-first** - Visible focus rings, global shortcut to open, no nested interactive traps
- 🔄 **Sync-ready architecture** - Local changes are queued; Google Drive sync is planned for a later roadmap phase

---

## Tech Stack

<p align="center">
  <img alt="EdgeMagic technology stack" src="https://skillicons.dev/icons?i=ts,react,vite,tauri,rust,sqlite,npm" />
</p>

| Layer | Technology |
|---|---|
| **Shell** | [Tauri v2](https://tauri.app) (Rust) |
| **Frontend** | React 19, TypeScript 5.9, Vite 7 |
| **Storage** | SQLite via `tauri-plugin-sql` |
| **Styling** | Custom design system, Geist-inspired typography |
| **Testing** | Vitest, React Testing Library |
| **Monorepo** | npm workspaces |

---

## Repository Structure

```
EdgeMagic/
├── apps/
│   └── desktop/              # Tauri desktop application
│       ├── src/               # React frontend
│       │   ├── capture/       # Drag-drop & clipboard capture
│       │   ├── productivity/  # Notes, Todo, Reminder, Saved
│       │   ├── features/      # Roadmap features and local bookmark utilities
│       │   ├── platform/      # Native Tauri integrations
│       │   ├── plugins/       # Plugin sandboxing & permissions
│       │   ├── settings/      # App preferences
│       │   └── ui/            # Shared design system components
│       └── src-tauri/         # Rust backend (window, native APIs)
├── packages/
│   ├── core/                 # Event bus, module manager, SQLite services
│   ├── module-api/           # Stable interface contract for modules
│   ├── types/                # Shared TypeScript types
│   └── sync-google-drive/    # Roadmap: Google Drive sync adapter skeleton
└── modules/
    └── clipboard/            # Clipboard capture module
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20
- [Rust](https://rustup.rs/) (stable toolchain)
- [Tauri CLI prerequisites](https://tauri.app/start/prerequisites/) for your OS

### Install

```bash
git clone https://github.com/datvn21/EdgeMagic.git
cd EdgeMagic
npm install
```

### Development

```bash
# Run the full Tauri desktop app with hot-reload
npm run desktop:tauri dev

# Or run just the web frontend
npm run desktop:dev
```

### Build

```bash
# Type-check the entire monorepo
npm run typecheck

# Build all packages
npm run build

# Build the desktop frontend assets
npm run desktop:build

# Build the Windows installer/app bundle
npm run desktop:bundle
```

### Test

```bash
npm test
```

---

## Architecture

EdgeMagic follows a clean separation between the native shell, core services, and the React UI.

```
┌─────────────────────────────────────────┐
│              React Frontend             │
│  (Widgets · Capture · UI · Settings)   │
├─────────────────────────────────────────┤
│            @edgemagic/core              │
│  (EventBus · ModuleManager · SQLite)   │
├──────────────┬──────────────────────────┤
│  @edgemagic/ │      @edgemagic/         │
│  module-api  │ future sync providers    │
├──────────────┴──────────────────────────┤
│           Tauri v2 (Rust)               │
│  (Window · Tray · Shortcuts · Native)  │
└─────────────────────────────────────────┘
```

**Key principles:**

- `@edgemagic/core` exposes stable interfaces; modules depend only on `module-api`
- Sync is a planned optional layer; local reads and writes are designed to work without it
- Fake/in-memory implementations are test-only; SQLite is always production
- Attachments are stored separately from item metadata

---

## Roadmap

- [x] Foundation - persistence, migrations, project structure
- [x] Native platform - clipboard, notifications, filesystem, global shortcuts
- [x] Capture routing - browser and desktop drag-and-drop
- [ ] Universal Search - desktop UI is temporarily incomplete; core search service exists, but the user-facing search widget is still roadmap
- [ ] Native screenshots - capture API shape exists, native screenshot adapter is still roadmap
- [ ] Browser bookmarks automation - manual Chromium bookmark import exists; automatic browser store reading is still roadmap
- [ ] Future sync - durable retry queue, Google Drive provider
- [ ] Signed releases and auto-update - code signing certificate and updater flow
- [ ] UX hardening - accessibility, keyboard polish, multi-monitor polish
- [ ] Future extensibility - plugin marketplace, cloud providers, AI capture tagging

---

## Release

Production releases are built by GitHub Actions from version tags and are created as draft GitHub Releases.

```bash
# 1. Update versions in package.json and apps/desktop/src-tauri/tauri.conf.json
# 2. Commit the version bump
git tag v0.1.0
git push origin v0.1.0
```

The release workflow builds the Windows bundle on `windows-latest`. Code signing and auto-update are planned for a later release phase, so early builds may show Windows SmartScreen warnings.

---

## Contributing

Contributions are welcome! Please open an issue first for significant changes so we can align on direction.

```bash
# After forking and cloning:
npm install
npm run typecheck   # must pass
npm test            # must pass
```

- Keep commits focused and atomic
- Follow existing code style (TypeScript strict, no `any`)
- Tests are required for new core services

---

## License

[MIT](./LICENSE) © 2026 datvn21

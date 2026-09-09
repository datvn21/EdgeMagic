# EdgeMagic — Design System

## Genre

Modern minimal utility UI. Compact, keyboard-first, zero decoration. Inspired by Vercel and Linear's design sensibility — everything serves function, nothing is ornamental.

---

## Visual Language

| Property | Value |
|---|---|
| **Default theme** | Dark |
| **Available themes** | `theme-dark`, `theme-light` |
| **Accent** | Deep teal (`#0d9488`) |
| **Danger** | `#ff6166` |
| **Success** | `#4ade80` |
| **Warning** | `#fbbf24` |
| **Focus ring** | `#8ab4f8` (dark) / `rgba(37,99,235,.22)` (light) |
| **Typography case** | Sentence case only — no decorative uppercase labels |
| **Letter spacing** | `−0.02em` headings, `−0.035em` widget titles |
| **Motion** | `120ms` fast / `180ms` normal — `cubic-bezier(.2,.8,.2,1)` |
| **Reduced motion** | All durations collapse to `1ms` via `prefers-reduced-motion: reduce` |

---

## Design Tokens

Defined in `apps/desktop/src/shared/styles/tokens.css` as CSS custom properties on `:root`.

### Spacing

| Token | Value |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-7` | 32px |

### Radius

| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | 6px | Tags, drag ghost |
| `--radius-md` | 10px | Inputs, cards |
| `--radius-lg` | 16px | Large surfaces |
| `--radius-window` | 20px | Edge panel outer shell |
| `--control-radius` | 11px | Buttons, icon buttons |

### Typography

```
--font-display: Geist, Inter, ui-sans-serif, system-ui, sans-serif
--font-body:    Geist, Inter, ui-sans-serif, system-ui, sans-serif
--font-mono:    "Geist Mono", ui-monospace, SFMono-Regular, monospace
```

### Control sizing

| Token | Value |
|---|---|
| `--control-height` | 40px |
| `--icon-size` | 18px |

### Shadows

| Token | Value |
|---|---|
| `--shadow-widget` | `0 18px 48px rgba(0,0,0,.18)` |
| `--shadow-control` | `0 8px 20px rgba(0,0,0,.16)` |

---

## Semantic Color Roles

Resolved per-theme in `apps/desktop/src/shared/styles/themes.css`. All components use these roles — never raw palette values.

| Token | Dark | Light |
|---|---|---|
| `--surface` | `#141414` | `#f5f5f5` |
| `--surface-raised` | `#1c1c1c` | `#f2f2f2` |
| `--surface-elevated` | `#232323` | `#ffffff` |
| `--item-surface` | `#242424` | `#ffffff` |
| `--item-hover` | `#303030` | `#e5e5e5` |
| `--text` | `#ffffff` | `#0a0a0a` |
| `--text-muted` | `#a1a1a1` | `#555555` |
| `--border` | `rgba(255,255,255,.13)` | `rgba(0,0,0,.13)` |
| `--border-strong` | `rgba(255,255,255,.22)` | `rgba(0,0,0,.22)` |
| `--hover` | `#2a2a2a` | `rgba(0,0,0,.06)` |
| `--active` | `#333333` | `rgba(0,0,0,.11)` |
| `--focus-ring` | `rgba(138,180,248,.38)` | `rgba(37,99,235,.22)` |

---

## Density Scale

Three density modes override spacing and typography tokens via utility classes. Applied to the root shell element.

| Class | Row height | Section padding | Title size | Widget heading |
|---|---|---|---|---|
| `.density-compact` | 42px | 12px | 13px | 16px |
| `.density-comfortable` *(default)* | 48px | 16px | 14px | 18px |
| `.density-spacious` | 56px | 20px | 15px | 19px |

> At viewport widths ≤ 420px or heights ≤ 720px, `.density-spacious` automatically falls back to compact values.

---

## Layout

### Window dimensions
Fixed `380 × 820px`, non-resizable, frameless, always-on-top, transparent background.

### Shell structure

```
app-shell (.edge-left | .edge-right)
└── edgebar                          ← animated slide-in panel
    └── module-panel                 ← flex column, full height
        └── widget-canvas            ← 100vh scroll container
            ├── widget-grid          ← expanded widget cards (max 2 visible)
            └── compact-widget-row   ← icon strip for collapsed widgets
```

### Edge position

The shell carries `.edge-left` or `.edge-right` which flips the slide animation direction via `--edge-shelf-offset` (`-14px` / `14px`).

### Focus view

When a widget is focused it receives the full available surface. `.focus-header` is left-aligned; `.focus-content` is a flex-grow scrollable region.

---

## Component System

All components live in `apps/desktop/src/shared/ui/` and follow an atoms → molecules → organisms hierarchy.

### Atoms

| Component | Class | Notes |
|---|---|---|
| `Button` | `.ui-button` | Variants: `primary`, `secondary`, `ghost`, `danger`; sizes: `sm`, `md` |
| `IconButton` | `.icon-button` | 32×32 min, transparent background, muted icon |
| `Checkbox` | `.ui-checkbox` | Custom toggle track + thumb, visually hidden `<input>` |
| `Heading` | `.ui-heading` | Levels 1–3 with optional eyebrow (`.ui-eyebrow`) |
| `Surface` | — | Semantic wrapper (`<section>`, `<article>`, etc.) |
| `Logo` | — | SVG mark, renders at configurable size |

### Molecules

| Component | Class | Notes |
|---|---|---|
| `WidgetHeader` | `.widget-header` | Frosted gradient header: title + optional eyebrow + action slot |

### Organisms

| Component | Notes |
|---|---|
| `WidgetShell` | Shared surface for every widget. Composes `WidgetHeader` + optional toolbar + body. Exposes `useWidgetShellAction` hook for child-to-header action injection. |

### Layout organisms (edge-shell)

| Component | Notes |
|---|---|
| `ShelfView` | Widget canvas: expanded `widget-grid` + compact `compact-widget-row` |
| `FocusView` | Full-surface single-widget focus |

---

## Interaction Principles

- **Keyboard-first** — every interactive element is reachable by keyboard; tab order follows visual order.
- **Visible focus rings** — `outline: 2px solid var(--focus)` + `box-shadow: 0 0 0 4px var(--focus-ring)` on all `:focus-visible` targets.
- **Silent success** — successful actions do not show modal dialogs or disruptive notifications.
- **No nested interactive elements** — buttons never contain other buttons or links.
- **Hover/active states** — defined for every clickable surface using semantic `--hover` and `--active` tokens.
- **Drag ghost** — custom offscreen ghost element (`.drag-ghost`) positioned at `inset: -10000px` during drag operations.

---

## File Map

```
apps/desktop/src/shared/
├── styles/
│   ├── tokens.css       ← global CSS custom properties
│   ├── themes.css       ← dark / light semantic color roles
│   ├── reset.css        ← baseline browser reset
│   ├── components.css   ← button, input, checkbox, heading, drag-ghost styles
│   ├── shell.css        ← app-shell, edgebar, module-panel, focus layout
│   ├── utilities.css    ← density scale, visually-hidden
│   ├── widgets.css      ← widget-specific styles (inbox, todo, notes, etc.)
│   └── index.css        ← import order manifest
└── ui/
    ├── atoms/
    │   ├── button.tsx
    │   ├── checkbox.tsx
    │   ├── heading.tsx
    │   ├── icon-button.tsx
    │   ├── logo.tsx
    │   └── surface.tsx
    ├── molecules/
    │   └── widget-header.tsx
    └── organisms/
        └── widget-shell.tsx
```

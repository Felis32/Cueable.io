# ShipCut — Design Architecture

Source of structure: editorial SaaS shell (sidebar + inset panel + floating prompt). Values are design defaults. Implement with tokens first, then tune by eye.

---

## Principles

1. **Warm paper, not chrome.** App chrome is greige. Pure white is only the inner content surface and inputs.
2. **One serif H1 per page.** Everything else is sans. That pairing is the product feel.
3. **Borders, not shadows.** Elevation is 1px `--line` plus a fill shift. Shadow only on floating UI (menus, dialogs, prompt bar, chat panel).
4. **Ink is the only loud color.** Primary actions are black pills. Accents are large tinted card fills, never body text.
5. **4px / 8px grid.** Radius scales with size: controls 8–10px, cards 12–16px, outer panels 16–20px. Pills (`9999px`) only for primary CTAs, chips, and status.

---

## 1. Tokens

Define these as CSS variables / Tailwind theme keys before any page work. Do not hardcode colors or radii in components.

```css
:root {
  /* Neutrals */
  --paper:          #F6F4F0; /* viewport behind the white panel */
  --sidebar:        #F5F5F2;
  --sidebar-hover:  #EFE8E1;
  --sidebar-active: #EDE8E1;
  --surface:        #FFFFFF; /* main panel, cards, inputs */
  --line:           #E7E2DD;
  --line-2:         #E0E0E0;
  --ink:            #171717; /* primary text + primary button fill */
  --ink-2:          #212121; /* headings */
  --muted:          #676767; /* secondary + placeholders */
  --muted-2:        #9A9A97; /* tertiary / disabled */

  /* Accent */
  --accent-olive:     #3B5423; /* progress, checkmarks, success */
  --accent-blue-bg:   #E2F5FF;
  --accent-blue-bg-2: #DDF2FD;

  /* Feature-card tints */
  --tint-rose:  #D8C1C2;
  --tint-sage:  #C9D9B4;
  --tint-peach: #ECC9BE;
  --tint-sky:   #C2DFFD;

  /* Dark */
  --night:   #181818;
  --night-2: #212023;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 40px;

  --gap-outer:     8px;
  --sidebar-w:     236px;
  --sidebar-w-min: 68px;
  --row-h:         48px;
  --row-h-list:    60px;
  --icon-sm:       16px;
  --icon-md:       24px;
  --avatar:        26px;

  /* Radius */
  --radius-control: 8px;
  --radius-card:    14px;
  --radius-panel:   18px;
  --radius-nav:     12px;
  --radius-pill:    9999px;

  --border: 1px;

  /* Type */
  --font-serif: "Newsreader", "Source Serif 4", Literata, Georgia, serif;
  --font-sans:  Inter, Geist, ui-sans-serif, system-ui, sans-serif;
}
```

| Use | Token |
|---|---|
| Viewport background | `--paper` |
| Sidebar fill | `--sidebar` |
| Content panel / cards / inputs | `--surface` |
| Dividers & card outlines | `--line` (alt `--line-2`) |
| Body / buttons | `--ink` |
| Page H1 | `--ink-2` |
| Subtitles, placeholders | `--muted` |
| Disabled | `--muted-2` |
| Success / progress | `--accent-olive` |
| Trial card | `--accent-blue-bg` → `--accent-blue-bg-2` |

---

## 2. Typography

| Role | Family | Weight | Size | Line-height |
|---|---|---|---|---|
| Page H1 | Serif | 400 | 27px | 1.2 |
| Page subtitle | Sans | 400 | 14px | 1.4 |
| Section header | Sans | 600 | 15px | 1.3 |
| Card title | Sans | 500 | 14px | 1.3 |
| Body | Sans | 400 | 14px | 1.45 |
| Button | Sans | 500 | 14px | 1 |
| Nav label | Sans | 500 | 13.5px | 1 |
| Meta (duration, author, credits) | Sans | 400 | 12px | 1.3 |
| Empty-state headline | Sans | 500 | 16px | 1.3 |

Serif is **only** the single largest heading on a page. Never on buttons, nav, cards, or body.

---

## 3. Layout metrics

| Token | Value | Where |
|---|---|---|
| Outer app gap | `--gap-outer` | Space between viewport / sidebar and the white panel, all four sides |
| Sidebar expanded | `--sidebar-w` | Icon + label |
| Sidebar collapsed | `--sidebar-w-min` | Icons only |
| Panel radius | `--radius-panel` | White content panel + sidebar outer corners |
| Card radius | `--radius-card` | Feature tiles, action cards, skills cards |
| Control radius | `--radius-control` | Buttons, inputs, search |
| Pill | `--radius-pill` | Primary CTA, chips, tags, trial badge |
| Card padding | `--space-5` | Action cards, feature tiles, empty states |
| Grid gap | `--space-4` | Feature row, skills grid, community grid |
| Section rhythm | `--space-6`–`--space-7` | Between major blocks |
| Nav / list row | `--row-h` / `--row-h-list` | Sidebar items; Quick Start / Library rows |
| Icons | `--icon-sm` / `--icon-md` | Inline vs card |
| Avatar | `--avatar` | User + community authors |

---

## 4. App shell

Present on every logged-in page. Build once as the layout; pages are content inside the panel.

```
[ paper ]
  [ sidebar panel ] [ surface panel ]
  [ floating prompt bar — bottom center ]
  [ support launcher — bottom right ]
```

No top navbar.

### Sidebar

- Fill `--sidebar`, outer radius `--radius-panel`.
- Top: logo + collapse toggle.
- Nav: 6 items, icon + label, ~14px icon-label gap, height `--row-h`.
- Active item: `--sidebar-active` fill, radius `--radius-nav`, inset a few px from sidebar edges.
- Hover: `--sidebar-hover`.
- Below nav: referral/gift control, then **TrialCreditCard**.
- Floor: **account row** (avatar + name + plan + chevron). Opens **upward**, anchored bottom-left.

**Account menu items**

1. Help centre → `docs.<product>` (external, not a modal)
2. Settings
3. Use referral code
4. Log out

### TrialCreditCard

Gradient `--accent-blue-bg` → `--accent-blue-bg-2`, radius `--radius-card`, padding `--space-4`.

- “Free Trial”
- “Expires in N days”
- Upgrade pill
- Thin olive progress bar
- “X / 1,000 credits used” + info icon

### Main panel

White (`--surface`), radius `--radius-panel`, inset by `--gap-outer`.

**PageHeader** (every page except Ask AI, which is centered):

- Left: serif H1 + one-line muted subtitle
- Right: optional ghost button, then primary black pill (often “+ Create new” with chevron)

### Floating UI (every page)

**FloatingPromptBar** — bottom center, over content. Rounded rectangle (near-pill). Rotating placeholder prompts. Mic, then gradient circular send.

**SupportChatLauncher** — bottom-right circle with product mark.

**SupportChatPanel** — docks bottom-right, titled with the AI agent name, input at the bottom. Uses shadow.

---

## 5. Pages

### Home

- H1: `Hi {name}, Welcome to ShipCut` + wave
- Subtitle: `How would you like to get started?`
- Two **ActionCards** side by side: Start recording / Upload videos. Full card is the hit target. Hover = slight fill darken, border unchanged.
- **ChecklistPanel** “Quick Start” with `0/4 done`. Four rows: circular checkbox, label, current row shows black “Next” pill. Completed: filled olive check + muted/strikethrough label.
- **Popular features**: 4 **TintedFeatureCards** in a row (tints: rose, sage, peach, sky).
- **From community**: **CommunityMediaCards** (same shape; art is a product still).

### Ask AI

Centered, not left-aligned.

- History dropdown, top-left of the content area (independent of sidebar)
- Centered serif H1: `Hey {name}, What's on your mind?`
- Centered muted subtitle
- Large rounded textarea; mic + circular send inside, bottom-right
- “Try these to get started” — 2×2 suggestion cards (icon, bold label, muted one-liner)

No PageHeader actions on the right.

### Library

- H1 `Your library` / subtitle `Everything your team has created` / `+ Create new`
- Toolbar under header, **right-aligned**: search, filter, sort, then grid/list toggle (active toggle is filled/bordered)
- Empty: shared **EmptyState**

### Skills

- Underline **Tabs**: Video skills / Doc skills
- **SegmentedControl**: For you / My skills
- `+ New skill` pill, top-right
- Community skills: 4×2 grid of bordered white cards (no tint). Icon top-left; star (favorite) and kebab appear on hover. Title + muted author/email.

### Brand Kit

Underline **Tabs**: Voices, Avatars, Backgrounds, Logos, Music, Glossary, Pronunciations.

Most tabs: **DashedUploadTile** grid (`+ Create…`, `+ Upload`, `+ Connect…`) — square-ish, centered icon + label, dashed 1–1.5px `--line` border, no fill.

Glossary: **TagInput** (“Type and press enter”), not tiles.

### Knowledge Base

Single centered empty state, larger than Library: illustration panel (blurred gradient + faint UI mock) → headline `Publish your content as a knowledge base` → one-line description → `+ Create knowledge base` pill.

### Auth

**SplitAuthLayout**, 50/50.

- Left: centered column — logo, serif H1, muted subtitle, Continue with Google, “or” divider, email, password (show/hide), submit disabled until valid, terms, SSO link, login/signup switch.
- Right: full-height blurred photographic gradient. No UI overlay.

### Onboarding

**OnboardingDialog** over dimmed/blurred app.

- Left: rotating proof panel (quote, stats, compliance) — same art language as auth.
- Right: 5-segment progress + prev/next chevrons; short question; either a single input (“Press Enter to continue”) or a wrap of selectable pill chips; primary + lighter Skip side by side.
- Last step: checklist of trial unlocks; CTA becomes `Start creating`.

### Docs (`docs.<product>`)

Separate product. Top bar, not sidebar: logo + title left, `Visit the website →` black pill right.

Hero: full-bleed blurred photo, centered white serif H1 `{Product} Documentation`, subtitle, search + `Ask AI` button.

Below: 2 popular-article pills, then category cards (icon, title, `N articles`).

Help centre in the account menu routes here.

---

## 6. Shared components

Build once. Do not fork per page.

| Component | Notes |
|---|---|
| `SidebarNavItem` | Icon + label; hover/active fills |
| `SidebarAccountMenu` | Opens upward from sidebar floor |
| `TrialCreditCard` | Blue gradient, progress, upgrade pill |
| `PageHeader` | Serif H1 + subtitle + right actions |
| `PrimaryPillButton` | `--ink` fill, `--radius-pill` |
| `GhostButton` | Transparent / light fill, same control radius or pill as sibling CTA |
| `ActionCard` | Icon + title + description; whole card clickable |
| `TintedFeatureCard` | Tinted art ~55–60% height; title + description on white below |
| `ChecklistPanel` + `ChecklistRow` | Counter, circular checks, current-row Next |
| `EmptyState` | Icon square → headline → subtext → CTA (Library + Knowledge Base) |
| `Tabs` | Underline (Skills + Brand Kit) |
| `SegmentedControl` | Pill segments (Skills) |
| `DashedUploadTile` | Brand Kit |
| `TagInput` | Glossary |
| `CommunityMediaCard` | Thumb + duration badge + author |
| `FloatingPromptBar` | Shadow allowed |
| `SupportChatLauncher` + `SupportChatPanel` | Shadow on panel |
| `OnboardingDialog` | Shadow allowed |
| `SplitAuthLayout` | Auth only |
| `DropdownMenu` | Shadow allowed |

Default card/panel: `1px solid var(--line)`, **no shadow**.

---

## 7. Implementation order

1. Tokens (sections 1–3) in the theme.
2. Shell: sidebar + panel + floating prompt + support launcher.
3. Shared primitives: `PageHeader`, pills, tabs, empty state, cards.
4. Pages in this order: Auth → Onboarding → Home → Ask AI → Library → Skills → Brand Kit → Knowledge Base → Docs.
5. After each page, screenshot at a fixed viewport width and compare to the reference frame before moving on.

---

## 8. Do / don’t

**Do**

- One serif H1 per page; sans everywhere else.
- Warm `--paper` around a white inset panel.
- Account menu at the sidebar floor, opening up.
- Reuse `EmptyState` and `Tabs` from the first page that needs them.

**Don’t**

- Serif on buttons, nav, or body.
- Drop shadows on cards or the main panel.
- Accent hues as text color.
- A top navbar in the logged-in app.
- Hardcoded hex / radii inside components.

# Overseer v1 - Implementation Plan

## Context

`overseer` is currently just `brief.md` and an empty git repo - this is a from-scratch build. The brief describes a local SolidJS + Vite app for managing tickets/docs as files inside a repo's `/planning` directory, so plans live next to the code they describe instead of in an external tracker, and both humans and AI coding agents can read/write them directly.

The brief explicitly points at a sibling repo, `cardhorde`, whose hand-maintained `/plans` directory (numbered frontmatter files, a `size`/`model`/`priority`/`readiness`/`depends_on` vocabulary, a model-mismatch stop protocol, wave-based implementation ordering, and a NEEDS/NOT-NEEDS scope doc) has already proven useful and should be generalized into Overseer rather than re-invented. That convention shaped several decisions below - the field vocabulary, the model-mismatch protocol for `AGENTS.md`, and the wave-based build order for this plan itself.

This plan exists so the actual build can happen in a future session without re-deriving scope or architecture from the brief each time.

## Locked decisions (confirmed with the user, do not re-litigate)

- **File I/O:** Vite dev-server middleware (`/api/*` routes backed by Node `fs`), no separate backend process or database. The app only works run via a dev-server-equivalent command, never as a static build.
- **Editor:** Milkdown (markdown-native, GFM parse/serialize, no lossy HTML round-trip) with a thin custom SolidJS wrapper.
- **Components/styling:** Kobalte (accessible unstyled SolidJS primitives) + Tailwind CSS.
- **This plan** lives as a single file (this one) rather than a full cardhorde-style `plans/` directory - that apparatus is what Overseer itself is meant to eventually replace.
- **Status set:** short single names, no "ready for X / X-ing" duplication - a ticket sitting unclaimed in a status is still just *in* that status. Final default list: `idea`, `design`, `planning`, `ready`, `in-progress`, `in-review`, `done`.
- **Writes stay inside `/planning`.** Overseer never edits a tracked repo's own root files (e.g. its `AGENTS.md`); Settings offers a copyable pointer snippet instead.
- **`dependsOn` is informational only in v1** - shown on the ticket, never blocks a status change.
- **No dedicated testing wave** - tests are written where cheap (tree/slug logic, path-traversal guard) alongside the feature work, not gated behind a separate pass.
- **Default port:** `48214` (arbitrary 5-digit, unlikely to collide), overridable via env var/config - not load-bearing, just needs to be concrete.
- **Drag-and-drop:** `@thisbeyond/solid-dnd` (the SolidJS-native option) for the status board.
- **Slug collisions** on create are silently auto-suffixed (`-2`, `-3`, ...); the user renames after if they want something cleaner.

## V1 scope cut

### Needs

- Vite + SolidJS + Tailwind + Kobalte scaffold with `/api/*` dev-middleware
- Gitignored per-user repo map (`.local/config.json` inside the Overseer app repo itself - not inside any tracked project)
- `/planning` tree: `docs/`, `projects/`, `archive/{docs,projects}`, arbitrary nesting depth
- `project.json` + `description.md` + `notes.md` + `comments.md` per project/ticket
- Doc `<name>.md` + `<name>.children/` nesting (distinct from projects' `children/`)
- `size`, `model` (+ required reason text), `priority`, `readiness`, `dependsOn`, `status`, `childOrder` fields
- Order-of-implementation as a first-class `childOrder` field on the parent (generalizes cardhorde's hand-maintained implementation-order file into data, reorderable without renaming folders)
- `overseer.config.json` per repo: configurable statuses with per-status `usage` text, `aiDocMode` flag, archive thresholds
- Sidebar: burger-collapsible repo switcher, collapsible docs/projects sections
- Ticket list view with lineage indentation, status, controls
- Ticket detail view: edit fields, navigate parent/children, update status
- Parent-chain status propagation prompt (closing all children offers to close the parent, cascades level by level, always with explicit confirm)
- Status board with drag-and-drop between configured statuses
- Manual archive/restore (subtree move, structure preserved) for both projects and docs
- Archive/purge suggestion banner (closed > N days / archived > N days), confirm-only, never auto-deletes
- Git-user resolution for `comments.md` attribution by reading `.git/config` / `~/.gitconfig` directly (never shelling out to `git`)
- Milkdown WYSIWYG editor for description/notes/doc bodies
- Minimal `comments.md` UI: append-only textarea + chronological list
- `AGENTS.md` at repo root (see outline below)
- `aiDocMode` as repo config + `planDoc` link field on tickets + informational UI reminders (Overseer never calls an LLM itself)
- Reusable component layer (Button, Dialog, Menu, Tabs, Select, Badge, etc.) over Kobalte + Tailwind

### Deferred (not v1, with reasoning)

- **Attachments** (general, and docs' `.attachments`) - brief itself says "I dunno yet" on shape; nothing else depends on it for v1.
- **Analytics/throughput/burnup** - brief says "eventually"; `statusHistory` is recorded in v1 specifically so this has data to work from later.
- **True background archive automation** - no persistent process exists in this architecture; v1 approximates it with an on-load check throttled via a localStorage timestamp (~once/24h), not a real daemon.
- **In-app AI invocation / plan-sufficiency checking** - Overseer structures files; judgment calls belong to the AI agent reading `AGENTS.md`, not to Overseer's own code.
- **Kanban swimlanes / multiple boards / custom layouts, wave-lane visualization** - base drag-between-columns satisfies the brief.
- **Rich comments** (threading, reactions, edit/delete) - brief only asks for who/what/when.
- **Non-GFM Milkdown plugins** (image paste, embeds) - tied to deferred attachments.
- **A literal CLI binary** - "usable from their terminal" is treated as a routing/URL-shape constraint, not a separate tool.
- **Search across tickets/docs** - not requested; natural v2 add once the data model is stable.
- **Multi-user/remote/auth** - brief is explicit this is local-only.

## On-disk data model

```
<repo>/planning/
  overseer.config.json
  docs/
    _index.json                        # [{slug, wave?}] - order of top-level docs
    architecture-overview.md
    architecture-overview.doc.json     # optional sidecar (title/tags/archivedAt), created on demand
    architecture-overview.children/
      _index.json
      caching-deep-dive.md
      caching-deep-dive.children/ ...  # recurses
  projects/
    _index.json
    payments-v2/
      project.json
      description.md
      notes.md
      comments.md
      children/
        refund-flow/                   # a "ticket" = a project with no (or empty) children/
          project.json
          description.md
          notes.md
          comments.md
  archive/
    docs/       # mirrors original relative path, lineage preserved
    projects/
```

`project.json`:

```json
{
  "id": "ulid",
  "name": "Refund Flow",
  "slug": "refund-flow",
  "status": "in-progress",
  "size": "M",
  "model": "sonnet",
  "modelReason": "Required whenever model != n/a - a bare label is unverifiable.",
  "priority": "must",
  "readiness": "ready",
  "dependsOn": ["payments-v2/webhook-retry"],
  "childOrder": [
    { "slug": "refund-ui", "wave": 1 },
    { "slug": "refund-api", "wave": 1 },
    { "slug": "refund-audit-log", "wave": 2 }
  ],
  "planDoc": "docs/payments-v2-plan.md",
  "tags": [],
  "createdAt": "2026-09-11T14:22:00Z",
  "updatedAt": "2026-09-11T14:22:00Z",
  "archivedAt": null,
  "statusHistory": [
    { "status": "idea", "at": "2026-08-01T09:00:00Z", "by": "Jane Doe <jane@example.com>" },
    { "status": "in-progress", "at": "2026-09-10T10:00:00Z", "by": "Jane Doe <jane@example.com>" }
  ],
  "config": {}
}
```

Notes:
- No stored `type: project|ticket` - "ticket" is purely structural (empty/missing `children/`), so it can't drift from reality.
- `childOrder` is a hint, not the source of truth. Source of truth for *which* children exist is the `children/` directory listing; on read, the API reconciles (unknown directories append at the end, stale entries drop on next write).
- `_index.json` only exists where there's no natural parent JSON to hang order on: root `projects/`/`docs/`, and any doc's `.children/`.
- `statusHistory` satisfies "record timestamps of status changes" without ever reading git log.

Corrections:
- Instead of storing model/modelReason - let's do complexity/complexityReason - and suggest that repos set a mapping in their model settings/instructions for when to use specific models - for instance Opus to plan and sonnet to implement generally, but for high complexity tickets stick to Opus for implementation as well as well, things like that.

`comments.md` (append-only):

```markdown
### 2026-09-11T14:22:00Z - Jane Doe <jane@example.com>

Comment body, plain markdown.

---
```

`overseer.config.json`:

```json
{
  "statuses": [
    { "key": "idea", "label": "Idea", "usage": "...", "order": 0, "terminal": false },
    { "key": "design", "label": "Design", "usage": "...", "order": 1, "terminal": false },
    { "key": "planning", "label": "Planning", "usage": "...", "order": 2, "terminal": false },
    { "key": "ready", "label": "Ready", "usage": "...", "order": 3, "terminal": false },
    { "key": "in-progress", "label": "In Progress", "usage": "...", "order": 4, "terminal": false },
    { "key": "in-review", "label": "In Review", "usage": "...", "order": 5, "terminal": false },
    { "key": "done", "label": "Done", "usage": "...", "order": 6, "terminal": true }
  ],
  "aiDocMode": true,
  "gitUser": { "name": null, "email": null },
  "archive": { "suggestAfterDaysClosed": 7, "purgeSuggestAfterDaysArchived": 30 }
}
```

`terminal: true` drives both archive-eligibility and parent-chain-close detection.

Gitignored per-user repo map, `overseer/.local/config.json` (inside Overseer's own repo, added to Overseer's own `.gitignore`):

```json
{
  "repos": [{ "id": "uuid", "path": "C:/my_progs/cardhorde", "label": "CardHorde", "addedAt": "..." }],
  "activeRepoId": "uuid",
  "ui": { "theme": "system" }
}
```

Ephemeral UI prefs (sort order, last filter, board scroll position) go to browser `localStorage`, keyed per-repo - no file needed.

## Status/workflow model

- Status set is entirely repo-config-driven, seeded with the 7-status default on first scaffold, editable via Settings (add/remove/reorder/relabel/rewrite usage/toggle terminal).
- Every status change appends a `statusHistory` entry (status, timestamp, resolved git user) and writes `project.json`.
- Parent-chain propagation fires only on a transition *into* a terminal status: check whether all siblings under the same parent are now terminal; if so, prompt to close the parent too. Accepting repeats the check one level up (multi-level cascade), each level requiring explicit confirm. Declining at any level stops the walk.

## Vite middleware API surface

Mounted as a Vite plugin via `configureServer`, backed by `fs/promises`. Every path-taking route resolves against the registered repo's `planning/` root and rejects traversal outside it (`..`, symlinks escaping the root) - this guard is mandatory, built in Wave 0, not bolted on later.

**App-level** (operates on `.local/config.json`):
- `GET/POST /api/repos`, `PATCH/DELETE /api/repos/:id`
- `GET /api/health`

**Per-repo config:**
- `GET/PUT /api/repos/:id/config` (creates default if absent)
- `GET /api/repos/:id/git-user` (repo-local `.git/config` -> global `~/.gitconfig` -> config's stored `gitUser` -> null, prompting the UI to ask)

**Projects:**
- `GET /api/repos/:id/tree?root=projects&includeArchived=false`
- `GET /api/repos/:id/projects/:path*`
- `POST /api/repos/:id/projects/:parentPath*` (slugify + collision-suffix, write skeleton files, update parent `childOrder`/root `_index.json`)
- `PUT /api/repos/:id/projects/:path*` (partial patch; status changes append `statusHistory`)
- `PUT /api/repos/:id/projects/:path*/description`, `/notes`
- `POST /api/repos/:id/projects/:path*/comments`
- `POST /api/repos/:id/projects/:path*/archive`, `/restore`
- `DELETE /api/repos/:id/projects/:path*?confirm=true` (only if already archived)
- `PUT /api/repos/:id/root-order?root=projects`

**Docs** (parallel shape): `tree`, `GET/POST/PUT docs/:path*`, `archive`/`restore`/`DELETE`, `root-order?root=docs`.

**Cross-cutting:**
- `GET /api/repos/:id/archive-suggestions` (computed stale-terminal / stale-archived list from config thresholds)

## AGENTS.md content outline

1. Pointer note for how a repo's own `AGENTS.md`/`CLAUDE.md` should reference this file (copyable snippet, offered from Settings, never auto-inserted)
2. The planning tree, briefly - `docs/` vs `projects/` vs `archive/`, `project.json` vs `doc.md`/`.children`
3. Field vocabulary table - `size`/`model`/`priority`/`readiness`/`status`/`dependsOn`/`childOrder`
4. Model-mismatch stop protocol, ported from cardhorde's `CLAUDE.md` (ticket's `model` vs the running session's model -> proceed or stop before reading further)
5. Status usage-field protocol - read the status's `usage` text before transitioning (e.g. move to `in-progress` on start, `in-review` when believed done, never self-promote to `done`)
6. `aiDocMode` workflow - at "planning" status, write a plan as a doc and link via `planDoc`, then prompt before proceeding; at "ready", read the linked `planDoc`, verify sufficiency, stop and ask if not
7. Comment/attribution etiquette - append-only format, note when a comment came from an agent and which model
8. "Never run git commands" reminder - git config is read-only, for attribution, never shelled out to
9. Parent-chain propagation etiquette for agents - ask before cascading a parent close, or note it in comments if non-interactive

## Build order

**Wave 0 - Scaffold & middleware plumbing** (blocks everything)
`package.json`, `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`, `src/routes/` (solid-router), `src/server/middleware/index.ts` (the `/api/*` Vite plugin), `src/server/paths.ts` (traversal guard), `.local/.gitkeep` + `.gitignore` entry, `AGENTS.md` (stub).
Done: `npm run dev` serves on `48214`, `/api/health` responds, an empty Solid shell renders with Tailwind and a working Kobalte dialog.

**Wave 1 - Repo registration + git-user resolution** (needs Wave 0)
`src/server/routes/repos.ts`, `src/server/routes/config.ts`, `src/server/fsPlanning.ts` (default scaffold), `src/server/gitUser.ts`, `src/lib/apiClient.ts`, `src/stores/repoStore.ts`, repo-picker UI, settings stub.
Done: registering a repo path scaffolds `/planning` with defaults, active repo persists to `.local/config.json`, git user resolves and displays.

**Wave 2 - Projects/tickets CRUD + tree** (needs Wave 1)
`src/server/routes/projects.ts`, `src/server/planningTree.ts` (recursive walk, slug/collision handling, `childOrder`/`_index.json` reconciliation), project.json schema/validation, `src/components/Sidebar/*`, `src/routes/ProjectListView`, `src/components/StatusBadge`, create/edit forms, `src/components/ui/*` base components.
Done: nested projects/tickets creatable to arbitrary depth, list view shows lineage indentation and status, field edits round-trip to disk.

**Wave 3 - Ticket detail, Milkdown editor, comments** (needs Wave 2)
`src/components/editor/MilkdownEditor.tsx` (Solid wrapper around Milkdown's framework-agnostic core via `onMount`/`onCleanup`, GFM preset), `src/routes/ProjectDetailView`, `src/server/routes/markdown.ts`, `src/server/routes/comments.ts`, `src/components/CommentList`, `src/components/CommentForm`.
Done: description/notes edit via WYSIWYG round-tripping clean GFM to disk, comments append with author+timestamp, parent/children nav works. This is the phase where the Milkdown wrapper has to actually work before ticket detail is real.

**Wave 4 - Status workflow, parent-chain propagation, kanban board** (needs Waves 1-2)
`src/server/routes/status.ts`, `src/components/StatusBoard`, `@thisbeyond/solid-dnd` integration, `src/components/ParentPropagationDialog`, `src/routes/BoardView`, Settings status-editor.
Done: dragging cards updates `project.json` + `statusHistory`; closing all children prompts to cascade-close the parent through multiple levels; statuses fully editable per repo and reflected live on the board.

**Wave 5 - Docs tree** (needs Waves 2-3)
`src/server/routes/docs.ts`, `src/server/docsTree.ts` (`.children`/`_index.json` convention), `src/routes/DocDetailView` (reuses Wave 3's editor), sidebar docs wiring, `planDoc`-picker UI on ticket detail.
Done: docs creatable/nestable/editable/reorderable independent of projects; a ticket can attach a doc via `planDoc`.

**Wave 6 - Archive lifecycle** (needs Waves 2, 4, 5)
`src/server/routes/archive.ts`, `src/server/archiveSuggestions.ts`, `src/components/ArchiveSuggestionBanner`, `src/stores/localPrefs.ts`, Archive browse view.
Done: manual archive/restore preserves subtree structure for both projects and docs; a dismissible, ~once/24h banner surfaces stale-closed and stale-archived items with bulk actions; permanent delete always requires explicit per-item confirm and only targets already-archived items.

**Wave 7 - AGENTS.md + ai-doc-mode surfacing** (needs Waves 2-6)
`AGENTS.md` (full content), Settings `aiDocMode` toggle + copyable snippet, informational status-aware banner on ticket detail.
Done: `AGENTS.md` accurately describes the shipped data model/API (written last, once behavior is stable), `aiDocMode` persists per repo.

**Wave 8 - Polish**
Empty-state/error-state pass across existing views, dark-mode contrast QA, keyboard nav pass.
Done: full walkthrough (register repo -> build a multi-level project tree -> run a ticket through its whole lifecycle including a multi-level parent close -> archive -> act on a suggestion banner) works without a blocking rough edge. Explicitly re-confirm what's pushed to v2 (attachments, analytics, search, wave-lane board UI) before calling v1 done.

## Verification

- After Wave 0: `npm run dev`, confirm the app loads at `localhost:48214` and `GET /api/health` returns 200.
- After each subsequent wave: exercise that wave's "Done" criteria above directly in the browser against a real throwaway repo path (not a mock), and inspect the resulting files on disk to confirm the on-disk shape matches this plan's data model.
- End-to-end before calling v1 done: run the full walkthrough in Wave 8 against a fresh repo, then again against `cardhorde` itself (read-only inspection is fine, avoid registering it for real writes unless the user wants to dogfood it) to sanity-check the data model against a real multi-level project tree.
- No automated test suite is required to ship v1 (see "No dedicated testing wave" above), but any test written alongside `planningTree.ts`, the slug/collision logic, or the path-traversal guard should run via `npm test` before that wave is marked done.

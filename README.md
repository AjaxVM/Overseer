# Overseer

A lightweight, local-first project management system. Overseer turns flat Markdown files and directory structures into a structured, real-time ticket and documentation system—no external database or cloud service required.

## Features

- **Flat-File Architecture:** Projects, docs, and tickets are stored directly in your codebase as standard Markdown files and JSON metadata.
- **Hierarchical Ticket IDs:** Automatically indexes tickets scoped to sub-projects (e.g., `1-implement-auth.md` generating ID `project-name-1`).
- **Real-Time Sync:** The backend watches registered repos' docs/projects directories and pushes changes to the UI over server-sent events.
- **Native OS Pickers:** Connect local repositories dynamically using native system file dialogs.
- **Custom Frontmatter Schemas:** Configurable project and ticket metadata (status, priority, estimate, complexity) stored in standard YAML frontmatter.

## Quick Start

### 1. Install Dependencies

Requires Node 23.6+ (the backend runs on Node's native TypeScript support) and NPM.

```bash
npm install
```

### 2. Run It

```bash
npm start
```

Builds the frontend, then serves it and the API from one process on http://localhost:11111 (set `"port"` in `~/.overseer.config.json` to change it).

For development, `npm run dev` runs the API (restarting on backend changes) and the Vite dev server together. The app stays on the same URL, with Vite proxying `/api` to the backend one port up.

### 3. Repository Configuration

Overseer maintains an `overseer.json` configuration file at your repository root to define project structures and issue tracking schemas:

```json
{
  "docsDir": "docs",
  "projectsDir": "projects",
  "frontmatterSchema": [
    { "name": "id", "type": "string" },
    {
      "name": "status",
      "type": "enum",
      "options": ["idea", "designing", "planning", "ready", "working", "reviewing", "done"]
    },
    {
      "name": "priority",
      "type": "enum",
      "options": ["must", "should", "could", "maybe"]
    }
  ]
}
```
# Overseer

A lightweight, local-first project management system built into your Vite workflow. Overseer turns flat Markdown files and directory structures into a structured, real-time ticket and documentation system—no external database or cloud service required.

## Features

- **Flat-File Architecture:** Projects, docs, and tickets are stored directly in your codebase as standard Markdown files and JSON metadata.
- **Hierarchical Ticket IDs:** Automatically indexes tickets scoped to sub-projects (e.g., `1-implement-auth.md` generating ID `project-name-1`).
- **Real-Time HMR Sync:** Vite dev server integration watches project directories and streams file changes directly to the UI via WebSockets.
- **Native OS Pickers:** Connect local repositories dynamically using native system file dialogs.
- **Custom Frontmatter Schemas:** Configurable project and ticket metadata (status, priority, estimate, complexity) stored in standard YAML frontmatter.

## Quick Start

### 1. Install Dependencies

Requires NPM.

```bash
npm install
```

### 2. Run the Development Server

```bash
npm run dev
```

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
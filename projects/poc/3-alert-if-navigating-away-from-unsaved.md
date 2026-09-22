---
id: poc-3
status: done
estimate: tiny
complexity: simple
priority: must
---
# Alert if navigating away from unsaved

Unsaved edits to a ticket/doc or repo settings now prompt before being discarded:
in-app navigation away from a dirty page (`App.tsx`'s `confirmDiscardIfDirty`), closing
or reloading the tab (`beforeunload`), and closing the settings/create modals (Escape,
outside-click, or Cancel) via their own dirty-snapshot checks.
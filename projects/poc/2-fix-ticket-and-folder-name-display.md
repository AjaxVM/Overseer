---
id: poc-2
status: done
estimate: tiny
complexity: simple
priority: must
---
# Fix ticket and folder name display

Should use the actual name of the ticket, which needs to be stored in the Frontmatter by default.
Folders should use the configured name as well.

When displaying tickets, should show the local issue number (minus the project name) as "#1" in a different styling before the name.

## Implementation Note

Ended up just separating the id with a colon before name, will revisit later.
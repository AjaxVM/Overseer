---
id: qk7pf
name: Track assignee history per status transition
status: idea
type: feature
estimate: small
complexity: moderate
priority: could
---
# Track assignee history per status transition

Deferred from poc-5 (support assignable fields), which only ships a single current `assignee` field per ticket.

Idea: record who owned a ticket at each status transition, as a historical log - e.g. when status changes, optionally set/prompt for an assignee at that moment, or allow manually annotating who owned a past transition after the fact. This is a record of history, not multiple simultaneous assignees - the ticket detail view should continue to only ever display the single current `assignee` value; the per-transition history would live separately (e.g. an expandable "history" section, or its own log/frontmatter array) and wouldn't change how the current assignee is shown or edited.

---
id: poc-15
name: Change how we index projects
status: idea
type: bug
estimate: tiny
complexity: simple
priority: must
---
# Change how we index projects

I have a few thoughts after playing with this PoC and improving it myself.

First, performance is bad and we are barely exercising it yet.
Second, the interface on the left is not great, it is doing the bare minimum, but we will encounter very real issues when trying to show ticket types, split the id from the name in the display, support arbitrary ordering, etc.

A few proposals flow from that:

- create a `projectmap` key in the project config
  - this will contain the ticket index, along with sub projects, the order they are in, and top-level metadata
  - when we edit a file we need to walk back up to find what was affected and keep in sync
  - we will need to refresh in case local edits to tickets were not cached into this map properly
- move on from a vite server/plugin - we need an actual backend running, it can serve the built frontend, but we need a lot more performance
- caching of the files in memory would be good, can look at last updatedat on the file to cache bust if need be - but ideally some sort of watchlist would be better
- sidebar should only show one project at a time, and it should list the tickets/sub-projects in the project, not nested all down.
  - Instead, opening a sub-project shifts the sidebar to have a top-level return to parent marker
  - side bar now shows the tickets/sun-projects of the current sub-project
- We can add the columnar/kanban view which only is tracking the tickets/sub-projects of the current project, which is a better grain than trying to walk down the structure
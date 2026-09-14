---
id: poc-15
name: Change how we index projects
status: done
type: feature
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

The other thing we are gonna need to do is change to UUIDs (maybe default to 5 characters, configurable in each repo) - the incrementing digits are nice for human readability and scanning, but I think we really do need other sort abilities, and we are gonna conflict with multiple users with the incremental ids. We'd also force users to update the projectmap/metadata for a project when they resolve those conflicts.

Another thing we must do, is not read/watch a directory until it is actually open in the app - it is slowing fast to walk each folder tree after actions are taken.

We should support a root project file, even when we move over to uuid for the ids, maybe start with an underscore and `_project.md` so it comes first. Same with `_project.json` - keep those root ones together. The json contains config, sorts and a file tree (so the API isn't walking all the files to present a project, it can just scan to true up ones that are missing) with metadata for rendering (probably true up occasionally or as a background job or if it sees a file modified or something, definitely on first start as a pre-commit hook as mentioned in #17). The project markdown is it's description - we can iterate from there.
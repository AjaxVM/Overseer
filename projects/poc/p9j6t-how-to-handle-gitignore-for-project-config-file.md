---
id: p9j6t
name: How to handle gitignore for project config file
status: done
type: bug
estimate: tiny
complexity: simple
priority: must
---
# How to handle gitignore for project config file

Generally I see _project.json has local only paths, mtime, etc. However the problem is that this makes the file non-portable.
But if this is the place where we are tracking the project order and other metadata then it SHOULD be portable - this is an issue.

I also see that for root projects it is not creating the _project.json so we can't order the sub-projects and such properly, we should fix in general, since this is really not the issue I thought. I am wondering if the manifests should be kept in memory (would need to be a LOT of tickets to ever cause issues there), that is local, and the _project.json file becomes something shaped properly to include in git?

NOTE: completed by removing the non-portable fields.
---
id: fb33w
name: Ability to link to other tickets
status: 
type: 
estimate: 
complexity: 
priority: 
assignee: 
---
# Ability to link to other tickets

We should add the ability to link to other tickets in a ticket with some convention. Since we are in markdown using something like `#ticketId` is a little janky, maybe `!ticketId` would be cleaner, with it optionally accepting `!#ticketId` in case a user copies the full thing?

In the editor it should blue underline to indicate a link, and then in view mode should hover to show the other ticket title/pills and such, and clicking navigate to that view.

These URLs should be relative or absolute - so it will first look in the current project, and if not, it will require the path, so `!xyz` would link to ticket id `xyz` in the same project as the reference. Meanwhile `!something.xyz` would look in the root projects for this repo for the `something` project, and the `#xyz` ticket inside there.

When we add ability to archive and/or move tickets we will need to keep into account references or allow them to break - that is a decision for that later.
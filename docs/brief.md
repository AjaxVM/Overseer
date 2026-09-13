# Overseer - dev-first project management

Overseer is a local (for now) utility that you can use to manage planning documents (tickets, progress, documentation, etc.) for projects.

## Description

When working on a project by myself, or with only other engineers, and especially with AI tools, I have found myself leaning toward creating a directory in the repo that houses plans, tickets, order of operations, etc.

Not only is this useful in general as all tickets are, but it means that changes live alongside their definitions/requirements, and are easily tracked and compared together.
Instead of setting up an integration to a specific external tracking tool, or needing to share ticket details with Claude for it to be able to implement or review, they now live side by side.

## Goals

The Goal is to create a SPA that runs locally (on a non-conflict port, maybe 5 digit long) where projects can be registered.
For now, it has no backend, app-specific configuration goes in localStorage (sort order, last filter, etc.) or in an overseer.config.json file in the /planning directory in a repo.

Planning should have folder representing concepts, ie:

./planning/docs -> architectural docs, diagrams, overarching design goals, etc.
./planning/projects -> houses projects/tickets inside them
./planning/archive/docs|projects -> archived projects or docs

projects are further segmented to allow infinite nesting.
Each project should have a name (which is sluggified as the folder name inside the parent dir)
Each project should have a project.json file which contains the actual name, any config, status, etc.
Each project should also have a description.md, notes.md and comments.md file.
Description would be the body of a project, notes are any notes added on (generally after the fact thoughts or addendums), and comments would be something that captures who (based on the configured git user for this repo) said what and when.
Projects then have a children directory, which houses either more projects, or tickets.
Tickets are just projects with no children.

Docs should allow nesting similarly to projects, but in this case the doc is the markdown, and children should just be <name>.children as a directory, so we can reference them together cleanly.

Attachments will become a thing I want, which is an easy directory add for planning, and possibly another <name>.attachments style for docs, or docs look like projects more and more just without tracking/ticket view, I dunno yet.

When updating a ticket you get an option to update the parent chain as well to change status (ie all tickets closed, option to close parent).

Status is enclosed in the ticket/project, though we should have an option to archive tickets no longer needed. These get moved into archive.
The app should suggest (maybe once daily) to archive any projects closed over a week ago, and delete any projects/docs archived over a month ago (since these are in GIT they are recoverable, and we are more providing a window where the UI can restore them rather than trying to persist everything forever).

## Interface

### UX

UX should be simple, with a sidebar that collapses in a burger menu for selecting repos (this should be stored as a project map config somewhere in the project, gitignored, as it would be setup per user).
Once selecting a project, there should be a switcher, or ability to open a selector for projects you are tracking.
For a Project, the sidebar should show a section that expands to read top-level docs. There should be another collapseable section to view projects.

Once navigating into a project (or projects root) you should see a list of tickets, with indentation showing the lineage. Each ticket shows a status and has controls to manage.
Clicking a ticket allows you to view it's details, edit them, navigate to parent's/children, update status, etc.

There should also be a status view that you can use to drag along statuses. What statuses are available should default to:
- idea
- ready for design/designing
- ready for planning/planning
- ready for work/ready
- in progress
- in review
- done

Basically encoding a basic, and in my eyes correct, SDLC where projects follow this path:

Ideation (generally leadership, but anyone can have an idea, at this point we aren't sure it is correct yet)
: this is the initial ticket/project
|- Design (idea is handed to a designer or group of them, or a user working with an AI tool)
  : ticket is either closed as not to be done, filed away into an icebox for another day, or moved forward with the gaps filled in to describe this properly
  |- Planning (idea is reviewed by a technical lead and product lead together, to ensure they both understand)
    : output is an implementation plan attached to the ticket, ready for an engineer to build
    |- In Progress/Review (implementer is making changes or getting feedback on them)
      |- done (ticket is done and ready to be released or is released)
        |- acceptance/iteration (not modelled here)
          : Can happen at multiple points depending on team structure and the feature
          |- prior to deploy to main/production, an approval gate by Product and/or the business
          |- after deployment but behind a feature flag, testing the thign and determining next steps before turning flag on or pivoting
          |- after deployment AND release, iterating toward the next thing (which becomes it's own ticket(s) later)

This is configurable in the project config. Each should also have a usage field to describe how/when to apply that status.

Otherwise a very clean, simple, Trello-like (or stripped down Linear) is what I am going for.

### Layout

The layout described here is a proposal, but ideally it should be easily describable and usable from their terminal to navigate or point their coding agent at.

### Analytics

Eventually the ability to see throughput, burnup, etc. will be awesome.

### Other bits

I am doing something similar in the cardhorde repo that is a sibling here, in the /plans dir. Please consider hwo that is being used and what functionality might be missing here I have already demonstrated is useful - things like estimating which models can handle it, estimating in general, order of implementation (I think part of description on a project) and such.

### AI Usage

We should include an AGENTS.md file that can be pointed to by projects or a user's global config, that explains how to write and use these tickets.
This should include checking usage field on status definitions to use them properly - and example might be that an AI should update the status to in progress when it starts and in review when it claims it is finished. When reviewing, it can ask to move to done, things like that.

Another setting, this time in the repo config I think, though a default at root is fine, is for ai-doc mode.
The AGENTS.md should instruct the LLM that when the ticket being assigned is in read for planning, they should write a plan as a document attached to the ticket, and prompt the user to review or proceed. This plan should be ready for it work against, or for a new session/separate LLM to pick up and understand, in conjunction with the ticket def, to execute.
When the ticket is in ready for work, and LLM should check for an attached plan, and verify it understands it and that it will be sufficient to deliver the ask, and if not to prompt the user how to proceed.

## Architecture

### Code decisions

This should be a single vite instance that is accessible from Browser.
Use SolidJS for the framework.

Docs and tickets should be markdown, let's bring in a wysiwig editor.

Implement a component library (or download one, for this use that is more OK that this looks like Material or some other clean, modern interface), but make sure that components and functionality are written as pieces that can be reused and not one offs all over.

Do not run git commands - this works on the folder structure and is bound to the work being done, so automatically committing, checking history or anything like that is a non-go. The only exception is just pulling active user/email if present, or possibly prompting the user to configure in their config (not project config).
This constraint likely pushes things like history and such out of scope - we can record actions on the tickets for timestamps of when they were created/changed status/etc. but checking git logs for changes to them or something is not in scope at all.

### Design decisions

Clean, white (or darkmode) color scheme - with paper/eggshell/light-cream main colors, and dark blue and metallic accents/text colors where applicable, dark mode some equivalently shifted scheme.

Take colorblindeness/contrast-weakness into account.


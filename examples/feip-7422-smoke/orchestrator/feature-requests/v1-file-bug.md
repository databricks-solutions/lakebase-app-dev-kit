---
author: Feature Requester
---

# v1: File a Bug in the Browser

A team has started using a shared bug tracker, and right now nothing exists in
the system. The first thing they need is to file a bug and be able to find it
again.

A team member should be able to open the app in their browser, fill in a short
title and a longer description on a create form, and submit it. When they
submit, they land on that bug's own page at a stable, shareable URL (for example
`/bugs/42`, where 42 is the bug's identifier). That URL is how they refer back to
the bug later, paste it into a chat message, or hand it to someone else. The
detail page shows the bug's title, description, status, and identifier.

A newly filed bug starts in the `open` state.

## Out of scope

The team is not yet managing the set of states themselves, and there is no list
or queue view yet, the only way back to a bug is its URL. Editing a bug after it
is filed, deleting bugs, assigning owners, and any kind of search or filtering
are all out of scope for now. Those capabilities come in later sprints.

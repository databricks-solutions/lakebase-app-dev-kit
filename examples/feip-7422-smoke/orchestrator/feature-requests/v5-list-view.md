---
author: Feature Requester
---

# v5: A View of the Bug List

So far the team has been retrieving bugs one at a time by
identifier. As the list has grown, that has become inadequate.
Team members want to open a page in their browser and see every
bug in the system at a glance, with enough context to decide which
one to look at next.

A team member should be able to open the bug list in a browser.
What they see is a list of every bug currently in the system, with
each row showing the bug's identifier, its title, the current
state (using the team's agreed state names from earlier work), and
the display name of whoever owns the bug. Bugs without an owner
show up clearly as unowned, not as a blank or missing field.

The order in which bugs appear should let the team find what they
care about. Bugs that are just-filed should appear before bugs
someone is working on, which should appear before bugs that are
done. Within the same state, the order is unspecified for now (the
team will come back with a sort preference if they need one).

When the list is empty (no bugs filed yet), the page should
acknowledge that explicitly. A team member should not see a blank
page and wonder whether the bug tracker is broken.

## Out of scope

Editing bugs from the list view is out of scope; the list is
read-only. Filtering, search, and pagination are out of scope.
Sorting beyond the by-state ordering is out of scope. Showing the
description or reproduction steps in the list is out of scope (the
list is for triage; the detail view a team member can already
access by identifier is where the long-form fields live).

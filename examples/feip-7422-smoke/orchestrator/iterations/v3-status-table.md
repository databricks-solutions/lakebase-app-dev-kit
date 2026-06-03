# v3: First-class Status Workflow

The team's three states (just-filed, someone-is-working-on-it, done)
have served them well, but lately a few frustrations have surfaced.
Status values get typos when entered casually. The team wants to add
a new state ("waiting on someone else") without coordinating with
everyone separately. And nobody can answer the question "what are
the legitimate states?" without grepping code.

The team wants status to become a first-class concept the system
understands: a recognised, ordered set of states with names the team
controls.

A team member should be able to ask the system to list all the
recognised states. The states come back in an order the team has
agreed on (just-filed first, then someone-is-working-on-it, then
done), so that a list of bugs can be ordered by status meaningfully.

When a team member changes a bug's status, they refer to one of
these recognised states by its agreed identifier rather than by a
free-text string. The system enforces that the referenced state
exists; an attempt to set a bug to a state the system does not
recognise is refused with a clear message.

Bugs that existed before this iteration should continue to work.
Their original status (just-filed, someone-is-working-on-it, or
done) should map to the same now-first-class state, and the bug
should look the same to a team member retrieving it. None of the
prior identifiers a team member has handed around should stop
resolving to their bug.

## Out of scope

The team is not yet asking to add or remove states at runtime; the
three states are fixed for this iteration. Workflow rules ("you
cannot move from done back to just-filed") are out of scope. Per-bug
history of status changes is out of scope. Status-based filtering
of the bug list is out of scope (the team is still looking up bugs
one at a time by identifier).

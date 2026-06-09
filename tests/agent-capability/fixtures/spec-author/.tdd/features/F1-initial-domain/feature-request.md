---
author: Feature Requester
---

# v1: Initial Domain

A team has started using a shared bug tracker. Right now nothing
exists in the system, and they need a way to file bugs, find them
again, change their state as work progresses, and reject obviously
invalid entries at the moment of filing.

A team member should be able to file a bug. They describe what went
wrong by giving the bug a short title, a longer description of the
situation, and noting whether anyone is already working on it. Once
filed, the bug has a stable identifier they can hand to someone
else, paste into a chat message, or refer back to days later.

When a team member has an identifier, they should be able to look
up the bug and see what was originally reported, exactly as filed.
If they ask for an identifier nobody has used, they should be told
the bug does not exist, clearly and without ambiguity.

As work progresses, the bug's status should be able to change. The
team has agreed on three states: a bug starts out as just-filed, may
be picked up by someone working on it, and eventually reaches done.
A team member moving the bug forward expects the new state to stick
across subsequent lookups.

The team has agreed these three states are the only legitimate ones
for a bug. If someone tries to file a bug with a status outside this
agreed set, whether by typo or by mistake, the system should refuse
the attempt rather than silently store an unknown value. The team
member should be told the value is not one of the recognised states.

## Out of scope

Assigning bugs to specific people is deferred. So is categorising
bugs by what they affect. Splitting longer reproduction notes from
the short description is deferred until reproduction steps start
outgrowing the description field. The team is not yet asking for a
bug list rendered in a browser; for now, retrieval is one-at-a-time
by identifier.

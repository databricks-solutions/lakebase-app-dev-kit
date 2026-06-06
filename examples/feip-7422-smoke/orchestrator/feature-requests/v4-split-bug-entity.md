---
author: Feature Requester
---

# v4: Reproduction Steps

The team has been filing bugs for a while, and the description
field has been collecting more than just descriptions. Team members
have started cramming reproduction steps in there too, sometimes
mixed in with the original description, sometimes appended below a
"steps to reproduce" divider they made up.

The team wants to acknowledge what is already happening informally:
bug details are not one blob; they are at least two things. The
description says what is wrong, and the reproduction steps say how
to make it happen again. These deserve to be separate when filing
a bug and separate when looking one up.

A team member filing a bug should be able to provide both fields:
the description (what went wrong, what was unexpected) and
reproduction steps (the recipe to make it happen again). Both
fields are optional individually but the bug carries both when set.

A team member looking up a bug should see both fields presented
separately, not concatenated into one blob.

A team member should be able to update either field on an existing
bug without disturbing the other. Editing reproduction steps does
not change the description; editing the description does not change
the reproduction steps.

For bugs filed before this iteration, the description text the team
member originally provided should remain associated with the bug
under the description field. The reproduction steps for those bugs
will be empty (the team accepts that previously-blended
"description-plus-repro" text will appear under description; team
members can move text to reproduction steps later as they touch
each bug).

If a bug is removed from the system, its associated details (both
description and reproduction steps) should be removed with it,
without leaving orphaned records behind.

## Out of scope

The team is not yet asking for structured reproduction steps
(numbered lists, screenshots, etc.); reproduction steps are
free-text. Editing history of either field is out of scope. There
is no need yet for a third field like "expected behaviour" beyond
description and reproduction steps.

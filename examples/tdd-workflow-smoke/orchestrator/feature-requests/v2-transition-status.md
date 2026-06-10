---
author: Feature Requester
---

# v2: Move a Bug Through Its States

Now that the team can file bugs and open each one by its URL, they need to track
where each bug is in their process. A bug that was just filed is `open`; as
someone picks it up, fixes it, and confirms the fix, it moves through a small set
of states.

On a bug's detail page, a team member should be able to change its status with a
control on the page. The states the team recognizes are `open`, `in-progress`,
`resolved`, and `closed`. Changing the status updates the bug, and the detail
page reflects the new status immediately.

If something tries to set a status the team does not recognize, the change must
be rejected when it is saved, with a clear error that names the offending value,
and the bug must keep its previous status, the unrecognized value is never
stored.

## Out of scope

The set of recognized states is fixed for now: the team is not yet defining
their own custom states, and there is still no list or queue view, a bug is
still reached only by its URL. Reordering the states, deleting them, or
recording a history of past transitions are all out of scope. Those come later.

# v2: Add Owners

The team has been using the bug tracker for a few weeks. Bugs are
being filed and worked on, but a recurring frustration is that
nobody can tell at a glance who is responsible for a given bug. The
team needs to introduce the idea of ownership.

A team member should be able to record themselves as a recognisable
participant in the system. They give a way to be reached (a contact
identifier, the kind of thing that uniquely identifies them inside
the team) and a display name that other team members will recognise
when they see it on a bug.

Once a team member is in the system, the rest of the team should be
able to see the list of recognised participants.

When a bug exists, a team member should be able to mark themselves
(or someone else) as the owner of that bug. The bug then carries
that ownership going forward, visible whenever someone looks the bug
up. Ownership is not mandatory at the time a bug is filed: it is
fine for a bug to sit unowned until someone claims it.

If a team member tries to assign a bug to a participant the system
does not recognise, the attempt should be refused with a clear
message explaining the participant is not known. The bug should
retain its previous ownership state, not be silently changed.

Bugs that were filed before the team started tracking ownership
should still work. Looking them up should still succeed, and they
should simply show that nobody owns them yet. The team can choose
to assign owners to old bugs later, or leave them unowned.

## Out of scope

Authenticating team members (verifying that someone claiming to be
a particular participant actually is them) is out of scope. So is
removing a participant from the system. The team is not yet asking
for a notification when a bug is assigned to them; ownership is just
recorded data for now.

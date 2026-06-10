---
author: Product Owner
---

# Bug Tracker (product overview)

The Product Owner's standing intent for the bug tracker that the kit's
end-to-end SCM-workflow smoke builds. It is deliberately open-ended: it
says who the product is for and what they need to accomplish, and the
Product Owner refines it between iterations as working software is seen.
It is project-level and is not a frozen contract. The structured
per-feature asks live alongside it as the Feature Requester's
[`feature-requests/`](feature-requests/); the Spec Author turns those
into the gated `feature-spec` artifacts.

## Who it is for

A team that maintains software and needs to keep track of the bugs in
it. They file bugs, find them again later, move them through the states
the team has agreed on, and eventually want to look across everything
that is still open.

## What they need to accomplish

- File a bug with enough detail that someone else can pick it up later.
- Refer back to a specific bug by a stable identifier they can share.
- Move a bug through the team's agreed states as work progresses.
- Attribute a bug to the person who owns it, and reassign it.
- Look across the open queue, not just one bug at a time.

## How the product is expected to grow

The product starts as the simplest thing that lets a team file and find
bugs, and earns each later capability only once the previous one is in
real use. The intended arc, in product terms:

1. File, retrieve, and transition a single bug.
2. Attribute bugs to people.
3. Let the team manage its own set of legitimate states rather than a
   fixed list baked into the product.
4. Separate a bug's longer reproduction detail from its short summary,
   once those notes start to outgrow the description.
5. See the open queue in a browser, not one bug at a time.

The Product Owner expects to revisit and extend this overview between
iterations.

## How I want to work

After each sprint I want to see **working software I can actually use**,
not designs, stubs, or partial scaffolding. Every iteration above must
land as something runnable and demonstrable before the next one starts;
that working increment is what I review to decide what the next sprint
should be.

## Product-level non-goals

- This is not a production-grade tracker. Sign-in, permissions, and
  who-can-see-what are out of scope.
- No notifications, no search, no pagination, no reporting beyond a
  simple open list.
- This overview does not say HOW the product is built. Technology,
  database schema, and endpoints are the Architect's and the
  implementation's concern; the harness records those in the smoke
  [`README`](../README.md), not here.

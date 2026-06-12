---
author: Product Owner
---

# Recipe App (product overview)

The Product Owner's standing intent for the recipe app that the kit's
end-to-end Lakebase-paired workflow grows one feature at a time. It is
deliberately open-ended: it says who the product is for and what they need
to accomplish, and the Product Owner refines it between iterations as
working software is seen. It is project-level and is not a frozen contract.
The structured per-feature asks live alongside it as the Feature Requester's
`feature-requests/`; the Spec Author turns those into the gated
`feature-spec` artifacts.

## Who it is for

Anyone who wants to keep and share recipes. Two ways people show up:

- **Visitors** who browse the collection and open a recipe to actually cook
  from it , read its ingredients and steps.
- **Contributors** who add a new recipe and fix or improve an existing one.

There are no accounts; anyone can read, add, and edit. The collection is the
shared artifact.

## What they need to accomplish

- Browse the recipes that exist, at a glance, not one at a time.
- Open a single recipe and read its description, ingredients, and
  instructions clearly enough to cook from.
- Add a new recipe with enough detail that someone else can make it.
- Edit a recipe that already exists when it needs fixing or improving.
- Return to (and share) a specific recipe by a stable, readable link.

## How the product is expected to grow

The product starts as the simplest thing that is recognizably a recipe app
, a schema and a UI , and earns each later capability only once the
previous one is in real use. Every iteration is **purely additive** (new
files + a registered slot, never a rewrite of a shared file) and **pairs a
code change with a schema migration**, so each pass exercises the full
Lakebase-paired loop. The intended arc, in product terms:

1. Browse, view, add, and edit recipes (the MVP).
2. Classify recipes with **tags** , cuisine, meal type, dietary labels ,
   so the collection can be understood and grouped, one tag kind at a time.
3. Layer on **cross-cutting capabilities** as they are wanted: keeping a
   recipe as a draft before it is shown publicly (visibility), finding a
   recipe by typing what you remember (search), and reviewing a submitted
   recipe before it joins the collection (review).

The Product Owner expects to revisit and extend this overview between
iterations.

## How I want to work

After each sprint I want to see **working software I can actually use**,
not designs, stubs, or partial scaffolding. Every iteration above must land
as something runnable and demonstrable before the next one starts, and the
schema change it carries must ride its pull request as an embedded diff;
that working increment is what I review to decide what the next sprint
should be.

## Product-level non-goals

- This is not a production-grade cooking platform. Sign-in, permissions,
  and who-can-edit-what are out of scope; anyone can read and write.
- No ratings, comments, photos, shopping lists, or meal planning unless a
  later iteration explicitly earns one.
- This overview does not say HOW the product is built. The framework,
  database schema, and routes are the Architect's and the implementation's
  concern; the harness records those alongside the build, not here.

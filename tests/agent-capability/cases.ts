// Agent capability registry: one case per role. The hermetic guard in
// agents-capability.test.ts asserts EVERY AgentRole has a case here (so "test
// every agent" is enforced), and the live runner exercises the `live: true`
// cases behind LAKEBASE_TEST_AGENTS=1.
//
// Adding a role to the live set: drop its inputs under fixtures/<dir>/ (laid out
// as the role expects, e.g. .tdd/features/<F>/...), set live: true, and list the
// artifact(s) it must produce in `produces`. The harness invokes the role and
// conformance-checks each produced artifact.

import type { AgentCapabilityCase } from "./harness.js";

export const CAPABILITY_CASES: AgentCapabilityCase[] = [
  {
    role: "spec-author",
    capability: "draft a conformant feature-spec.json from a feature-request",
    fixture: "spec-author",
    model: "haiku", // proven: with the corrected doc, even haiku conforms
    task:
      "Acting as the Spec Author, draft .tdd/features/F1-initial-domain/feature-spec.json " +
      "from .tdd/features/F1-initial-domain/feature-request.md and .tdd/product-overview.md, " +
      "conformant to feature.schema.json per your agent doc. Write only that file.",
    produces: [{ path: ".tdd/features/F1-initial-domain/feature-spec.json" }],
    live: true,
  },

  // Registered for coverage; fixtures/runtime still to build. Each needs prior
  // conformant inputs (architect: feature-spec + story + ac; test-strategist:
  // ac; ux-designer: design-brief) authored under fixtures/<dir>/.
  {
    role: "architect-reviewer",
    capability: "produce a conformant architecture.json (nfrs[] + brief_ref coverage) from the draft spec",
    fixture: "architect-reviewer",
    task:
      "Acting as the Architect Reviewer, write .tdd/features/F1-initial-domain/architecture.json " +
      "(conformant to architecture.schema.json) covering every Required NFR in nfrs.md via brief_ref. Write only that file.",
    produces: [{ path: ".tdd/features/F1-initial-domain/architecture.json" }],
    live: false,
    note: "needs a conformant feature-spec.json + story.json + ac.json + nfrs.md fixture",
  },
  {
    role: "test-strategist",
    capability: "produce a conformant test-list.json (items[] ordered) from the ACs",
    fixture: "test-strategist",
    task:
      "Acting as the Test Strategist, write .tdd/features/F1-initial-domain/test-list.json " +
      "(conformant to test-list.schema.json: feature_id + items[] each with id/description/ac_id/status). Write only that file.",
    produces: [{ path: ".tdd/features/F1-initial-domain/test-list.json" }],
    live: false,
    note: "needs conformant ac.json + architecture.json fixture",
  },
  {
    role: "ux-designer",
    capability: "produce a conformant design-guide.json from the design-brief",
    fixture: "ux-designer",
    task:
      "Acting as the UX Designer, write .tdd/design/design-guide.json " +
      "(conformant to design-guide.schema.json: typography + colors + spacing) from design-brief.md. Write only that file.",
    produces: [{ path: ".tdd/design/design-guide.json" }],
    live: false,
    note: "needs a design-brief.md fixture",
  },
  {
    role: "navigator",
    capability: "write the next failing test for the dispatched story's top test-list item",
    fixture: "navigator",
    task: "Acting as the Navigator, write the next failing test for the top pending test-list item.",
    produces: [],
    live: false,
    note: "produces project test code, not a schema-gated artifact; needs a scaffolded project + test runner",
  },
  {
    role: "driver",
    capability: "make the failing test pass with the simplest code",
    fixture: "driver",
    task: "Acting as the Driver, make the failing test pass with the simplest change.",
    produces: [],
    live: false,
    note: "produces project code; needs a scaffolded project + failing test + test runner",
  },
  {
    role: "product-owner",
    capability: "facilitate intake (product-overview / nfrs / feature-request) on the human's behalf",
    fixture: "product-owner",
    task: "Acting as the Product Owner, author the missing intake artifact from the recorded intent.",
    produces: [],
    live: false,
    note: "facilitation role; headless behavior is the Human Proxy supply path (covered by the smoke)",
  },
  {
    role: "release-engineer",
    capability: "deploy the feature to the local target, verify reachability, surface the deploy gate",
    fixture: "release-engineer",
    task: "Acting as the Release Engineer, deploy to the local target and verify reachability.",
    produces: [],
    live: false,
    note: "needs a deployable scaffolded project + a running target; covered by the smoke /deploy step",
  },
  {
    role: "scrum-master",
    capability: "route the workflow deterministically (no artifacts of its own)",
    fixture: "scrum-master",
    task: "n/a",
    produces: [],
    live: false,
    note: "routing is deterministic and covered by the driver's pure tests (orchestrator-drive.test.ts), not a live artifact case",
  },
];

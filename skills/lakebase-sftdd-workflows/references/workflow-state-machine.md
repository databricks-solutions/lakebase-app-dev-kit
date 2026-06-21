# Workflow state machine (SFTDD)

The end-to-end state machine for `lakebase-sftdd-workflows` (**Spec-First Test-Driven Development**). It composes two disciplines back to back: the **SDD** design lane (`/design`) and the **TDD** build lane (`/build`), wrapped by sprint planning (`/plan`), deploy (`/deploy`), and the top-level `/sprint` loop. The deterministic driver `lakebase-sftdd-drive` routes every transition; gates (keyed `plan` / `spec` / `test_list` / `promote` / `deploy`) are the HITL decision points.

Canonical phase names come from `workflow-state.json.current_workflow_phase`:
`discovery`, `architectural-review`, `test-list-construction`, `design-spec-gate`, `implementation`, `synthesis`, `review`, `shipped`, `abandoned`.

## How a run begins

Three entry commands (all shown in the diagrams):

- **`/sprint`** (Tier 1) is the primary start: the top-level orchestrator that runs the whole loop (planning -> design -> build -> deploy) continuously and resumably, looping per increment. This is the normal way a run begins.
- **`/plan`** (Tier 2) starts the same planning phase but stops after the PLAN gate (single phase); `/design`, `/build`, `/deploy` likewise run one phase and stop.
- **`/spike`** is a side entry: throwaway exploration on its own paired branch, OUTSIDE the gated loop. Its notes carry forward into a feature's design-spec gate; its code is never promoted.

Both `/sprint` and `/plan` require project intake (`product-overview.md` + `nfrs.md`, plus `design-brief.md` for UI projects).

## Command tiers

### Tier 1: `/sprint` (one continuous, resumable loop)

The top-level orchestrator. Runs planning to deploy and loops per increment.

```mermaid
flowchart LR
    S(["/sprint"]) --> P["① /plan"]
    P --> PG{{② PLAN gate}}
    PG --> D["③ /design (SDD)"]
    D --> B["④ /build (TDD)"]
    B --> DP["⑤ /deploy"]
    DP -. "working software feeds back" .-> P
```

### Tier 2: single-phase commands (run ONE phase, then stop and suggest next)

```mermaid
flowchart LR
    P2["/plan"]
    D2["/design"]
    B2["/build"]
    DP2["/deploy"]
    SK["/spike (outside the loop, no gates)"]
```

## State machine, by command

Each slash command is its own small state machine. The internal states and gate
are shown below, one command per diagram. How they connect (and everything outside
them) is in the high-level diagram that follows.

**Legend.**

```mermaid
flowchart LR
    OR(("orchestr-<br/>ator")):::orch
    AG(("agent")):::role
    TL["② determ.<br/>step"]:::determ
    HU(("human")):::human
    ST["① agent step"]
    GT{③ gate}
    ART(["artifact.json"]):::artifact
    ARTF(["frozen<br/>artifact"]):::frozen
    OR -. routes .-> ST
    OR -. runs .-> TL
    AG -. responsible .-> ST
    TL -. produces .-> ART
    HU -. decides .-> GT
    classDef orch fill:#C9D2D4,stroke:#3D4A4F,stroke-width:2px,color:#0B2026;
    classDef role fill:#FFE9E4,stroke:#FF5F46,stroke-width:2px,color:#0B2026;
    classDef determ fill:#DCE7E6,stroke:#1B3137,stroke-width:2px,color:#0B2026;
    classDef human fill:#2C3E5A,stroke:#1F2E45,stroke-width:2px,color:#FFFFFF;
    classDef artifact fill:#F4F1E8,stroke:#B9A88F,stroke-width:1px,color:#0B2026;
    classDef frozen fill:#F4F1E8,stroke:#C9A227,stroke-width:3px,color:#0B2026;
```

Every step carries a **circled number** ①②③ giving the orchestrator's action order: ① is
the first thing the orchestrator does (route into the opening phase), and the count follows
what it does next, **including the deterministic tool runs**, which are steps in their own
right. There are two kinds of step rectangle: a **white** one is an agent-driven phase (a
**coral** agent circle is attached: Spec Author, Architect, Test Strategist, Navigator,
Driver, Release Engineer, Product Owner); a **teal** one is a deterministic step the
orchestrator runs (a tool like `sync-backlog`, `analyzeForGate`, `detectAll`,
`compareExperiments`, `promoteExperiment`, `lakebase-sftdd-deploy`), never agent-authored;
the orchestrator's running of a teal step is shown by its teal color, not a separate edge.
Diamonds are gates; **navy** circles are the human, who decides every gate, approve or
reject (the human-in-the-loop checkpoint). **Gray** circles are the deterministic
orchestrator (`lakebase-sftdd-drive`), which routes every transition, runs the deterministic
steps, and presents gates; it is drawn once, routing the opening step. **Parchment** pills
are artifacts (files written to disk), produced by the step they hang off; a pill with a
**bold gold border** is frozen by its command's gate (the exact gate-to-artifact mapping is
in the Gates table below), and a command ends at its frozen artifacts. Agents and the human
are drawn next to the step they act on.
Every gate also writes `gates.json` + `selection-log.md` (see the Gates table); those
universal records are omitted from the diagrams to reduce clutter.

### `/plan` (sprint planning, phase: planning)

```mermaid
flowchart LR
    ORCH1(("orchestr-<br/>ator")) -. routes .-> proposing
    SA(("Spec<br/>Author")) -. responsible .-> proposing
    proposing["① proposing"] -. produces .-> fp(["feature-proposals.md"])
    proposing --> sizing
    AR(("Architect")) -. responsible .-> sizing
    sizing["② sizing, XS to XL"] -. produces .-> est(["estimates.json"])
    sizing --> committing
    PO(("Product<br/>Owner")) -. responsible .-> committing
    committing["③ committing"] -. produces .-> fr(["feature-request.md"])
    committing --> syncbacklog
    syncbacklog["④ sync-backlog<br/>projects the backlog"] -. produces .-> bk(["backlog.json"])
    syncbacklog --> PlanGate
    HU(("human")) -. decides .-> PlanGate
    PlanGate{⑤ PLAN gate}
    PlanGate -->|reject or refine| proposing

    classDef orch fill:#C9D2D4,stroke:#3D4A4F,stroke-width:2px,color:#0B2026;
    classDef role fill:#FFE9E4,stroke:#FF5F46,stroke-width:2px,color:#0B2026;
    classDef determ fill:#DCE7E6,stroke:#1B3137,stroke-width:2px,color:#0B2026;
    classDef human fill:#2C3E5A,stroke:#1F2E45,stroke-width:2px,color:#FFFFFF;
    classDef artifact fill:#F4F1E8,stroke:#B9A88F,stroke-width:1px,color:#0B2026;
    classDef frozen fill:#F4F1E8,stroke:#C9A227,stroke-width:3px,color:#0B2026;
    class ORCH1 orch;
    class SA,AR,PO role;
    class syncbacklog determ;
    class HU human;
    class fp,est,fr artifact;
    class bk frozen;
```

### `/design` (SDD lane, Spec Driven Development)

```mermaid
flowchart LR
    ORCH1(("orchestr-<br/>ator")) -. routes .-> discovery
    SA(("Spec<br/>Author")) -. responsible .-> discovery
    discovery["① discovery"] -. produces .-> spec(["feature-spec.md/json"])
    discovery -. produces .-> storyac(["story + ac files"])
    discovery --> archReview
    AR(("Architect<br/>Reviewer")) -. responsible .-> archReview
    archReview["② architectural-review<br/>layer, NFR coverage"] -. produces .-> arch(["architecture md/json"])
    archReview --> SpecGate
    HU1(("human")) -. decides .-> SpecGate
    SpecGate{③ spec gate}
    SpecGate -->|approve| testList
    SpecGate -->|reject, re-spec| discovery
    TS(("Test<br/>Strategist")) -. responsible .-> testList
    testList["④ test-list-construction<br/>Beck-ordered, scoped per story"] -. produces .-> tl(["test-list.json"])
    testList --> TestListGate
    HU2(("human")) -. decides .-> TestListGate
    TestListGate{⑤ test_list gate}
    TestListGate -->|approve| analyze
    TestListGate -->|reject, reorder| testList
    analyze["⑥ analyzeForGate<br/>design-spec analysis, N, strategies, budget"] -. produces .-> plan(["plan.json"])
    analyze --> DesignGate
    HU3(("human")) -. decides .-> DesignGate
    DesignGate{⑦ experiment-plan gate}

    classDef orch fill:#C9D2D4,stroke:#3D4A4F,stroke-width:2px,color:#0B2026;
    classDef role fill:#FFE9E4,stroke:#FF5F46,stroke-width:2px,color:#0B2026;
    classDef determ fill:#DCE7E6,stroke:#1B3137,stroke-width:2px,color:#0B2026;
    classDef human fill:#2C3E5A,stroke:#1F2E45,stroke-width:2px,color:#FFFFFF;
    classDef artifact fill:#F4F1E8,stroke:#B9A88F,stroke-width:1px,color:#0B2026;
    classDef frozen fill:#F4F1E8,stroke:#C9A227,stroke-width:3px,color:#0B2026;
    class ORCH1 orch;
    class SA,AR,TS role;
    class analyze determ;
    class HU1,HU2,HU3 human;
    class storyac,arch artifact;
    class spec,tl,plan frozen;
```

### `/build` (TDD lane, Test Driven Development)

Read the circled step numbers ① to ⑥ for the orchestrator's order, starting at the TDD
oval. The deterministic steps are the teal ones: `detectAll` (②) runs each cycle, then on
loop end `compareExperiments` (④, N>=2), then once the gate is approved
`promoteExperiment` or `synthesizeExperiments` (⑥). The TDD loop itself (the oval) is
expanded in the next diagram.

```mermaid
flowchart TB
    ORCH1(("orchestr-<br/>ator")) -. routes .-> TDDloop
    TDDloop(["① TDD loop<br/>per-story Beck cycle"])
    TDDloop -->|after every cycle| detectAll
    detectAll["② detectAll<br/>smell sweep each cycle, surfaced to PO, never auto-fix"] -. produces .-> smells(["smells.json"])
    detectAll -->|remediation, back to loop| TDDloop
    TDDloop -->|test list exhausted, per story| Accept
    HU1(("human")) -. decides .-> Accept
    Accept{③ accept story?}
    Accept -->|N = 1, single experiment| ffr(["feature-spec.json<br/>ready-for-review"])
    Accept -->|revise re-spec, or discard| TDDloop
    Accept -->|N >= 2, race converges| compareExp
    compareExp["④ compareExperiments<br/>N >= 2 experiments converge"] -. produces .-> report(["comparison-report.md"])
    compareExp --> PromoteGate
    HU2(("human")) -. decides .-> PromoteGate
    PromoteGate{⑤ promote gate}
    PromoteGate -->|approve, promote or synthesize| promote
    promote["⑥ promoteExperiment /<br/>synthesizeExperiments"] -. produces .-> pref(["promote_ref"])
    promote -. produces .-> ffr
    promote -->|synthesize: fresh branch| TDDloop

    classDef orch fill:#C9D2D4,stroke:#3D4A4F,stroke-width:2px,color:#0B2026;
    classDef role fill:#FFE9E4,stroke:#FF5F46,stroke-width:2px,color:#0B2026;
    classDef determ fill:#DCE7E6,stroke:#1B3137,stroke-width:2px,color:#0B2026;
    classDef human fill:#2C3E5A,stroke:#1F2E45,stroke-width:2px,color:#FFFFFF;
    classDef loop fill:#FFF4F0,stroke:#FF5F46,stroke-width:2px,color:#0B2026;
    classDef artifact fill:#F4F1E8,stroke:#B9A88F,stroke-width:1px,color:#0B2026;
    classDef frozen fill:#F4F1E8,stroke:#C9A227,stroke-width:3px,color:#0B2026;
    class ORCH1 orch;
    class detectAll,compareExp,promote determ;
    class HU1,HU2 human;
    class TDDloop loop;
    class smells,report artifact;
    class pref,ffr frozen;
```

#### The TDD loop (Beck cycle)

The Beck cycle is the inner row, PLAN to REFACTOR. The orchestrator routes into PLAN to
start each cycle; the Navigator and Driver do the work; the agents never write the cycle
artifacts.

```mermaid
flowchart LR
    ORCH(("orchestr-<br/>ator")) -. routes .-> PLANb
    NAV1(("Navigator")) -. responsible .-> PLANb
    PLANb["PLAN"] -->|failing test| RED
    NAV2(("Navigator")) -. responsible .-> RED
    RED -->|minimal honest code| GREEN
    DRV(("Driver")) -. responsible .-> GREEN
    GREEN -->|review| REVIEW
    NAV3(("Navigator")) -. responsible .-> REVIEW
    REVIEW -->|cleanup needed| REFACTOR
    NAV4(("Navigator")) -. responsible .-> REFACTOR
    REFACTOR -->|next item| PLANb
    REVIEW -->|next item, no refactor| PLANb

    classDef role fill:#FFE9E4,stroke:#FF5F46,stroke-width:2px,color:#0B2026;
    classDef orch fill:#C9D2D4,stroke:#3D4A4F,stroke-width:2px,color:#0B2026;
    class NAV1,NAV2,NAV3,NAV4,DRV role;
    class ORCH orch;
```

### `/deploy`

```mermaid
flowchart LR
    ORCH(("orchestr-<br/>ator")) -. routes .-> deploy
    RE(("Release<br/>Engineer")) -. composes remote .-> deploy
    deploy["① lakebase-sftdd-deploy<br/>deploy, poll reachable, feature-verify"] -. produces .-> evidence(["deploy-evidence<br/>reachability proof plus verify result"])
    deploy --> DeployGate
    HU(("human")) -. decides .-> DeployGate
    DeployGate{② deploy gate}
    DeployGate -->|reject, not reachable or verify failed| deploy
    DeployGate -->|approve| shipped
    shipped["③ shipped<br/>working software live"]

    classDef orch fill:#C9D2D4,stroke:#3D4A4F,stroke-width:2px,color:#0B2026;
    classDef role fill:#FFE9E4,stroke:#FF5F46,stroke-width:2px,color:#0B2026;
    classDef determ fill:#DCE7E6,stroke:#1B3137,stroke-width:2px,color:#0B2026;
    classDef human fill:#2C3E5A,stroke:#1F2E45,stroke-width:2px,color:#FFFFFF;
    classDef artifact fill:#F4F1E8,stroke:#B9A88F,stroke-width:1px,color:#0B2026;
    classDef frozen fill:#F4F1E8,stroke:#C9A227,stroke-width:3px,color:#0B2026;
    class ORCH orch;
    class RE role;
    class deploy determ;
    class HU human;
    class evidence frozen;
```

## High-level state machine

Each command is an orchestrator-driven sub-machine (detailed in the diagrams above); here
they are black boxes wired together. The deterministic orchestrator (`lakebase-sftdd-drive`)
drives every transition; the circled numbers ① to ⑤ give its order through the commands, and
every arrow leaving a command is that command's final gate approved by the human. Living
outside the per-command machines are the `intake` precondition (its three required inputs),
the `/sprint` loop back from shipped, the `/spike` side-entry, and the `abandoned` terminal.

```mermaid
flowchart TB
    INIT((start))
    Intake["Project intake<br/>precondition, not a gate"]
    Plan["① /plan<br/>sprint planning, PLAN gate"]
    Design["② /design (SDD)<br/>spec, test_list, experiment-plan gates"]
    Build["③ /build (TDD)<br/>per-story accept, promote gate"]
    Deploy["④ /deploy<br/>reachable plus verify, deploy gate"]
    Shipped["⑤ shipped<br/>working software live"]

    Design -->|PO abandons| Abandoned["abandoned, terminal"]
    Build -->|abandon-all, stalled population| Abandoned
    Abandoned --> DONE((end))

    INIT -->|required inputs| po(["product-overview.md"]) & nfr(["nfrs.md"]) & db(["design-brief.md (UI)"])
    po & nfr & db --> Intake
    Intake -->|/sprint or /plan, enter sprint planning| Plan -->|PLAN gate approved, design per feature| Design -->|spec frozen, /build| Build -->|ready for review, /deploy| Deploy -->|deploy gate approved| Shipped

    Shipped --> DONE

    SPK(("/spike")) --> Spike["/spike<br/>side-mode, no gates"]
    Spike -.->|notes carry forward to the experiment-plan gate| Design
    Spike -->|branch torn down, notes preserved| SPKEND((spike<br/>ends))

    Shipped -->|/sprint loops to the next increment| Plan

    classDef artifact fill:#F4F1E8,stroke:#B9A88F,stroke-width:1px,color:#0B2026;
    class po,nfr,db artifact;
```

## States

| State (phase) | Lane | Command | What happens | Exit gate |
|---|---|---|---|---|
| Project intake | precondition | (none) | `product-overview.md` + `nfrs.md` (+ `design-brief.md` for UI) exist | none (precondition) |
| `planning` (proposing / sizing / committing) | sprint | `/plan`, `/sprint` | Spec Author proposes breakdown; Architect sizes; PO commits `feature-request.md`; `sync-backlog` builds `backlog.json` | **`plan` gate** |
| `discovery` | SDD | `/design` | Spec Author drafts `feature-spec` + stories + ACs | feeds `spec` gate |
| `architectural-review` | SDD | `/design` | Architect Reviewer assigns `layer` + `architectural_notes`, writes `architecture` md/json, covers NFRs | **`spec` gate** (arch folds in) |
| `test-list-construction` | SDD | `/design` | Test Strategist builds the Beck-ordered test list, scoped per story | **`test_list` gate** |
| `design-spec-gate` | SDD | `/design` | Analyzer proposes the experiment plan (N, strategies, budget) to `plan.json`; PO signs off | experiment-plan approval |
| `implementation` | TDD | `/build` | Per-story experiment; Navigator/Driver run PLAN -> RED -> GREEN -> REVIEW -> REFACTOR; smells after each cycle | per story: **accept / discard / revise** |
| `synthesis` | TDD | `/build` | N>=2 only: `compareExperiments` report; PO picks | **`promote` gate** (promote or synthesize) |
| `review` | TDD | `/build` | Ready-for-review: accepted experiment merged into the feature branch, PR-ready | (to deploy) |
| `deploy` | deploy | `/deploy` | Deploy merged feature/story; poll reachable; run feature-verify | **`deploy` gate** |
| `shipped` | terminal | (loop) | Working software live; feeds the next `/plan` | loops to planning |
| `abandoned` | terminal | (any) | PO abandons, or stalled experiment population (`abandon-all`) | none |
| `spike` | side-mode | `/spike` | Throwaway branch, no gates; notes carry forward to a feature's design-spec gate | none |

## Gates (HITL decision points)

Gate statuses: `open` / `approved` / `superseded` / `withdrawn` (`gates.json`, ADR-0004).

**Produced after every gate, regardless of which one.** On approval the substrate writes
the same three records every time:

1. **`gates.json` entry** (the authoritative machine state): `status: approved`, decider,
   timestamp, and a content hash of each certified artifact, so `verifyGateIntegrity`
   can later flag drift if a frozen file changes. Agents read this.
2. **`selection-log.md` append** (the human-readable narrative-of-record): one
   append-only decision line. Humans read this; the substrate dual-writes it at every
   state change.
3. **`gate.approved` event** in `.tdd/agent-log.jsonl`.

**The specific artifact each gate certifies (freezes):**

| Gate | `gates.json` key | Decided after | Certifies (frozen artifact) | Reject path |
|---|---|---|---|---|
| sprint PLAN gate | sprint-level (not a per-feature key) | sprint planning | `backlog.json` (committed feature ids + sizes) | refine planning |
| spec gate | `spec` | discovery + architectural-review | `feature-spec.{md,json}` + per-story `story.{md,json}` + `acs/<AC>.{md,json}` (architecture folds in) | back to discovery (re-spec) |
| test_list gate | `test_list` | test-list-construction | `test-list.json` (Beck-ordered, scoped per story) | back to test-list (reorder) |
| experiment-plan gate (design-spec-gate) | `plan` | `analyzeForGate` proposal | `plan.json` (`{ feature_id, N, mode, strategies[], budget, rationale }`, plus attached `spike_inputs[]`) | renegotiate the plan |
| promote gate | `promote` | synthesis (N>=2) | `promote_ref` (`<winner-slug>:<branch_id>`); `feature-spec.json` transitions to ready-for-review | continue / abandon-all |
| deploy gate | deploy-evidence (not a per-feature key) | deploy | deploy-evidence: reachability proof + `feature-verify` result against the running app | back to deploy (fix) |

## Invariants

- **Spec-first within an increment.** The `spec` and `test_list` gates freeze the spec before any product code; the TDD lane refuses to start until they are approved.
- **Evolutionary across increments.** The freeze is per increment, not forever: each `/plan` re-plans from the last working software; architecture evolves under fitness functions; the database evolves by migration on the paired branch, diffed against its parent.
- **The orchestrator never writes spec/code/tests.** `lakebase-sftdd-drive` is deterministic routing; role agents (Spec Author, Architect Reviewer, Test Strategist, Navigator, Driver, Release Engineer) do the work, communicating only through on-disk artifacts.
- **Every gate is HITL.** Live, the human answers; headless, the Human Proxy answers only on present + format-conformant artifacts.

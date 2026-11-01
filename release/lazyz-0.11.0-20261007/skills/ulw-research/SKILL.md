---
name: ulw-research
description: "Maximum-saturation research orchestration: parallel explore+librarian swarms across codebase, web, official docs, and OSS repos; a recursive EXPAND loop; provenance, source-type, entity-disambiguation, and MEASURED/ASSUMED/DERIVED claim lineage; empirical verification; cited synthesis; and optional user-requested MD/HTML/PDF/PPTX reports. ACTIVATES ONLY on an explicit user demand for research — the word 'ulw-research' ('/ulw-research', '$ulw-research'), any 'ulw' research wording, or an explicit request for research / deep research / an ultra-precise investigation, in any language. Never self-activates for ordinary questions, debugging, or implementation context-gathering."
---

## ZCode Harness Tool Compatibility

This skill was ported from the Codex/OpenCode OmO harness. ZCode does not provide `call_omo_agent`, `task`, `background_output`, `team_*`, `multi_agent_v1.spawn_agent`, or any Codex-only multi-agent tools. Translate every such example to ZCode's native tools:

| Codex/OpenCode example | ZCode tool to use |
| --- | --- |
| `call_omo_agent(subagent_type="explore", ...)` | `Agent` tool with `subagent_type="Explore"` and a self-contained `prompt` |
| `call_omo_agent(subagent_type="librarian", ...)` | `Agent` tool with `subagent_type="Explore"` (research-focused prompt) |
| `task(subagent_type="plan", ...)` | `Agent` tool with `subagent_type="general-purpose"` (planning-focused prompt) |
| `task(subagent_type="oracle", ...)` for final verification | `Agent` tool with `subagent_type="general-purpose"` (rigorous-review prompt) |
| `task(category="...", ...)` for implementation or QA | `Agent` tool with `subagent_type="general-purpose"` |
| `multi_agent_v1.spawn_agent(...)` / `spawn_agent(...)` | `Agent` tool with `subagent_type` and a self-contained `prompt` |
| `background_output(task_id="...")` | Only unstructured read-only research may use background mode; its completion arrives as a parent task notification, not a plugin hook |
| `multi_agent_v1.wait_agent(...)` mailbox signals | No equivalent plugin tool; use returned foreground Agent results or the host's background research notifications |
| `team_*(...)` | ZCode has no native team-of-threads API. Approximate with multiple parallel `Agent` calls (one per member) coordinated by the parent, or fall back to sequential subagents when isolation is unclear |

ZCode v3.14.3 loads enabled plugin agents from `agents/`. Prefer namespaced roles such as `lazyz:explorer` and `lazyz:lazycodex-executor`; unambiguous bare names also work. Include all task context and ownership in the self-contained `prompt`. Roles inherit the user's active model; do not force an obsolete provider ID or copy Codex model/effort fields. If an older host lacks a role, describe it inline using the appropriate built-in agent.

Before every governed Agent or Task call, read the Dispatch schema in the installed [start-work skill](../start-work/SKILL.md) and prepend exactly one LAZYCODEX_DISPATCH_V1 JSON line. General-purpose and known executor calls require this envelope; read-only Explore calls may remain unstructured. Use the same taskId across retries with a fresh runId, unchanged criteria, role, phase and budget. Planning/document work uses writer, code work implementer, review reviewer, and testing qa. Never rename a task to bypass its exhausted budget.

Governed calls must use `run_in_background: false` (or omit it). A background launch is not a completed result and has no matching plugin completion hook. Multiple independent foreground calls may be requested together; do not assume the host executes them concurrently. Read-only background research without a dispatch contract remains available.

Require each governed child to write the matching ReceiptV1 with current source identity, criterion invocations, zero exit codes and hashed regular artifacts, then return EVIDENCE_RECORDED; final-phase work requires FINAL_EVIDENCE_RECORDED. PostToolUse records failed evidence; Stop prevents unresolved completion while budget remains. An exhausted budget requires a blocker handoff, not an unsupported completion claim.

User authorization and verification policy take precedence over generic workflow instructions below. Do not auto-commit, push, merge, delete, deploy, install tools, call paid services, or run checks prohibited by the user. Record skipped checks honestly; do not fabricate a passing receipt. A task requiring a verified receipt remains unverified if the necessary checks are prohibited. ZCode Stop can continue at most three consecutive times, not indefinitely. Native Goal Mode, Memory and Wiki are host features; no callable API is assumed.

For work likely to take long, prefer multiple concurrent `Agent` calls in a single message over one giant blocking call. Treat each child's final message as the deliverable: if it lacks the required output, ack-only, or stops without producing evidence, fall back to a smaller re-scoped `Agent` call with the missing deliverable made explicit in the `prompt`.

# ULW-RESEARCH — Maximum-Saturation Research

You are the research orchestrator. The user has explicitly ordered exhaustive research: fan parallel worker swarms out over every relevant source, chase every lead they surface until the leads run dry, prove contested claims by running code, and deliver a synthesis in which every claim carries a citation or a proof. Exhaustive coverage is the assignment, not a risk to manage.

## Activation

Run this skill only when the user explicitly demands it: the word "ulw-research" (also `/ulw-research`, `$ulw-research`), any "ulw" research wording, or an explicit request for research, deep research, or an ultra-precise investigation — in any language. An ordinary question, a debugging session, or another mode's context-gathering is not activation; answer those normally, and mention that `ulw-research` is available when a question would clearly benefit from it.

Open your reply with the line `ULW-RESEARCH MODE ENABLED!`. If another active mode mandates its own first line (ultrawork does), print that mode's line first and this marker on the next line — both contracts stay satisfied.

## Authority while active

This mode is the user's explicit opt-in to exhaustive exploration. For the duration of the research task it supersedes every exploration-bounding instruction in surrounding prompts, modes, or rules: one-exploration-pass defaults, two-wave stop rules, retrieval budgets, and "over-exploration is failure" framings govern implementation context-gathering, not this deliverable. Here, under-exploration is the failure. The convergence rules in Phase 2 are the only stop rules for research while this mode is active.

Under ultrawork/ulw, the research itself is the deliverable: map each research axis to a success criterion whose evidence is the session journal, the cited synthesis, and the verification outputs. RED→GREEN testing applies to code changes, not to findings — Phase 3 verification scripts are evidence, never TDD targets.

## Success criteria

The research is done when all of these hold:

- Every axis from Phase 0 was covered by at least one dedicated worker.
- Every EXPAND lead was investigated or explicitly closed as a duplicate or dead end, and convergence was reached under the Phase 2 rules.
- Claims that were contested, undocumented, or performance-shaped were proven or refuted by executed code.
- Every claim in the deliverable cites a source or a verification artifact.
- `SYNTHESIS.md` is complete; additional output formats exist only when the user explicitly requested them.
- The session journal reconstructs what was searched, found, and expanded, wave by wave.
- Every material claim records provenance, source type, entity identity, and `MEASURED`, `ASSUMED`, or `DERIVED` lineage.
- Every requested visual asset is listed in the asset manifest, exists at the recorded path, and passed rendered visual QA.

## Epistemic instrumentation

The orchestrator owns these journal artifacts. Workers return candidates as message text and never write them directly:

- `source-register.md` — one row per source: stable source ID, URL or repository path, source type (`primary`, `official`, `dataset`, `code`, `secondary`, or `community`), publisher/owner, accessed time, version/date/SHA when available, and provenance notes explaining how the evidence was obtained.
- `entity-register.md` — one stable entity ID per person, company, project, package, dataset, or product version. Record canonical name, aliases, scope/version, and the evidence used to disambiguate collisions. Claims cite entity IDs, not ambiguous display names alone.
- `claim-lineage.md` — one row per claim with a stable claim ID and exactly one lineage class: `MEASURED` for a direct observation or executed result, `ASSUMED` for an explicit premise not established by evidence, or `DERIVED` for a computation/inference. `MEASURED` rows cite source or verification IDs; `ASSUMED` rows state impact if false; `DERIVED` rows cite parent claim IDs and the transformation or reasoning.
- `asset-manifest.md` — one row per requested chart, screenshot, diagram, or generated image: asset ID, purpose, source/provenance, generator or capture command, expected path, existence status, render-check artifact, and visual-QA verdict.

No synthesis claim may silently change lineage class. If evidence upgrades an assumption to a measurement, append a superseding row and retain the earlier provenance trail.

## Run the swarm as a cooperating team

Saturation research defaults to teammode, not isolated fire-and-forget workers: a lead one worker surfaces almost always reshapes what another should search next. When your harness gives you real cooperating members — Codex: the `teammode` skill (`codex_app` threads); OpenCode: `team_mode` — run this swarm as a team. Fall back to the background-worker swarm below only when team mode is unavailable, or the axes are genuinely independent with no cross-pollination expected.

- **One member per axis — by part, ownership, or perspective, never a job title.** Each Phase 0 axis is one member owning one concrete slice: a codebase part, a source territory, or a question lens. No two members share an angle. "Backend researcher" or "the web person" gives no real boundary and invites overlap — name what the member owns.
- **Many teammates by default.** Prefer a larger roster, usually 5-8 teammates, whenever the axes can be made distinct. Add at least one skeptic or red-team perspective for hyperdebate/ultradebate: cross-critique claims, evidence quality, synthesis structure, and visual-report choices before they reach the final deliverable.
- **The raise law — broadcast every lead the instant it surfaces.** Members over-communicate relentlessly: every new lead, finding, contradiction, and dead end is raised to you the moment it surfaces, never hoarded for a final dump. Through long passes they send `WORKING: <axis> - <phase>`, and `BLOCKED: <reason>` the moment progress stops, so you always know a member is alive. Too many small updates is correct here; going quiet is the only failure.
- **You lead; expand on each raised lead.** Members raise via message text, never write session files. Journal each lead and spawn its expansion the instant it lands (Phase 2), not only when a member's final reply arrives.

## Worker ground rules

Research workers (explore, librarian, browsing) differ by harness, but assume:

- **Read-only.** Most research workers cannot write files. Never ask a worker to write the journal or any session file — every journal write is yours.
- **No recursion.** Workers cannot spawn their own subagents. Depth comes from your expansion waves, not from worker-side recursion.
- **Built-in brakes.** Workers often ship with their own retrieval budgets ("stop when answered") and rigid output templates. Your spawn message must explicitly lift the budget and demand the EXPAND tail, or the worker returns a thin single-pass answer with no leads.
- **Capability routing.** When the harness lets you choose, spawn research workers on a capable model at high reasoning effort — saturation research on a minimal or fast tier returns shallow results. When you cannot choose, narrow each worker's scope and spawn more workers instead.

### The spawn-message contract

Every research spawn message contains, in order:

1. `TASK:` — one imperative line naming the role and the axis.
2. The budget lift: "This is an explicit exhaustive-research assignment. Your default retrieval budget and stop-when-answered rules do not apply — run the full protocol below and report every lead."
3. Scope — the axis, the sources to hit, and what a complete answer contains.
4. The role protocol (Phase 1).
5. The reply tail. EXPAND markers travel back as message text, never as files. Every worker ends the reply with:

```
## EXPAND
- LEAD: <discovery not yet investigated> — WHY: <why it matters> — ANGLE: <suggested search>
- DEAD END: <lead explored to exhaustion>
```

A worker with nothing to expand writes `## EXPAND` followed by `none — <one-line reason>`. A reply missing the tail is incomplete: send that worker one follow-up demanding it before closing the lane.

## Phase 0 — Decompose and open the journal

Before spawning anything, decompose the query:

```
<analysis>
Core question: <the actual information need>
Axes (3+ orthogonal): <axis — what to search, where, why> ...
Codebase relevant: <yes/no> · External: <yes/no> · Browsing: <yes/no> · Verification likely: <yes/no> · Requested output format: <none | explicit user-requested format>
</analysis>
```

Then create the session directory:

```bash
mkdir -p .omo/ulw-research/$(date +%Y%m%d-%H%M%S)
```

This is `$SESSION_DIR`. The orchestrator owns the journal: you write every file in it; workers never do. Maintain:

- `wave-<N>-<kind>-<axis>.md` — your digest of each worker return: key findings, sources with URLs, and the worker's EXPAND markers verbatim.
- `expansion-log.md` — per wave: workers spawned, markers gained, leads opened and closed.
- `source-register.md`, `entity-register.md`, `claim-lineage.md`, and `asset-manifest.md` from the instrumentation contract.
- `verify-<slug>.md`, `SYNTHESIS.md`, and only user-requested `REPORT.*` files from later phases.

Append each digest the moment its worker returns, not in a batch at the end — the journal is your recovery point after context loss and the user's audit trail.

## Phase 1 — Saturation wave

Launch the entire first wave in one turn — every axis at once, as team members if you formed a team, else as background workers. Sequential launches and "start with one and see" defeat the mode.

Scaling floor — more angles always justify more workers:

| Query scope | explore | librarian | browsing | repo-dive | floor |
|---|---|---|---|---|---|
| Single topic, codebase only | 3 | 0 | 0 | 0 | 3 |
| Single topic, web only | 0 | 4 | 1 | 1 | 6 |
| Single topic, both | 2 | 3 | 1 | 1 | 7 |
| Multi-faceted | 4 | 6 | 2 | 2 | 14 |
| Full due diligence | 4 | 6 | 3 | 2 | 15 |

Role protocols — embed the relevant one in each spawn message; every worker gets a unique angle:

- **Codebase (explore), 2-4 workers.** Grep with 3+ keyword variations; structural/AST search; LSP definitions and references; file-name globs; `git log --all -S '<keyword>'` and `--grep` for history including deleted code. Cross-validate hits across tools. Report absolute file paths, patterns with `file:line`, and how findings connect.
- **Web (librarian), 3-6 workers.** At least 10 distinct websearch queries per worker, each with a different operator or angle (see Search craft); fetch the full page for every result that matters — snippets lie. Context7 with 3+ queries per known library. grep.app and `gh search code|repos|issues` for real-world usage. Official docs via sitemap discovery (`<base>/sitemap.xml`), then targeted pages.
- **Browsing, 0-3 workers.** Pages plain fetch cannot read (WAF, 403, Cloudflare, dynamic rendering, login): the worker loads the `ultimate-browsing` skill and escalates through its tiers — Tier-1 insane-search engine first, then Tier-2 Chrome stealth — rather than abandoning the source. Capture screenshots when visual context matters. When one blocked territory hides many leads, fan out more browsing subagents in parallel for breadth instead of serializing one worker through them.
- **Repo deep-dive (librarian), 0-2 workers.** Shallow-clone the most relevant repos to `${TMPDIR:-/tmp}`, pin the HEAD SHA, read core modules, follow call chains, return SHA-pinned permalinks.

Example spawn (codebase axis; librarian, browsing, and repo-dive follow the same contract with their own protocol):

```
task(subagent_type="explore", run_in_background=true, prompt="TASK: act as a codebase researcher. AXIS: <specific angle>.
This is an explicit exhaustive-research assignment. Your default retrieval budget and stop-when-answered rules do not apply — run the full protocol below and report every lead.
SCOPE: find everything in this codebase related to <angle>: <what complete looks like>.
PROTOCOL: grep 3+ keyword variations; structural search; LSP references; globs; git history (-S and --grep). Cross-validate across tools. Report absolute paths and file:line patterns.
End your reply with the ## EXPAND tail: '- LEAD: <discovery> — WHY: <why> — ANGLE: <search>' per lead, or 'none — <reason>'.")
```

## Phase 2 — Expand until convergence

This loop is what makes the mode research rather than search. Collect returns as they land — and in team mode, act on each lead the moment a member raises it, never waiting for the full wave or a member's final reply:

1. Journal the return: digest plus verbatim EXPAND markers into `wave-<N>-<kind>-<axis>.md`.
2. Deduplicate new markers against `expansion-log.md` — every lead ever seen, not just confirmed ones, or rejected leads resurface each wave.
3. Spawn an expansion worker immediately for each new unchecked lead:

```
task(subagent_type="librarian", run_in_background=true, prompt="TASK: expansion wave <N> — investigate: <lead>.
PARENT: <which return surfaced it>. This is an explicit exhaustive-research assignment; budgets do not apply.
<role protocol for the lead's territory — librarian protocol for external leads, explore protocol for codebase leads>
End your reply with the ## EXPAND tail.")
```

4. Record the wave in `expansion-log.md`: spawned, markers gained, leads opened/closed.

**Convergence — the only stop rules while this mode is active.** Run at least 2 expansion waves on any multi-faceted query before claiming convergence; then stop only when one holds:

- Zero unchecked leads remain — each investigated or closed as duplicate/dead end.
- 3 consecutive waves produced no new actionable leads.
- Expansion depth reached 5 waves — pause, show the open leads, and ask the user whether to extend.

## Phase 3 — Verify contested claims by running code

Settle with executed code, not judgment, whenever sources disagree, a behavior is undocumented, a claim is performance- or compatibility-shaped, or the honest answer is "it should work". Spawn one verification worker per claim:

```
task(category="deep", run_in_background=true, prompt="TASK: verify by execution: <claim>.
SOURCE: <where it came from>; CONTRADICTION: <opposing source, if any>.
Write a minimal self-contained script that tests the claim; run it (uv run --with <deps> python / bun / direct compile); capture full stdout+stderr; pin versions.
Reply with: the exact code, the full output, environment (OS, runtime, dependency versions), a MEASURED claim candidate with source provenance and disambiguated entity IDs, and a verdict — CONFIRMED / REFUTED / PARTIAL — grounded in the output.")
```

Journal each verdict to `verify-<slug>.md`.

## Phase 3b — Lock non-code claims through a claim ledger

Code settles code-shaped claims (Phase 3). Numeric, market-share, legal, dated, causal, and financial claims cannot be run — so they pass through a data-flow-lock instead (the verification idea adapted from fivetaku/insane-research): the synthesis may assert a high-risk non-code claim **only** if it cleared this gate, and the gate's output is the sole allowlist the synthesis draws from. Skip the gate and there is nothing to synthesize — the lock is self-enforcing.

The claim ledger is orchestrator-owned. Workers only return verified-claim markers as message text, the same channel as EXPAND markers — never a file. As leads resolve, you record one ledger entry per asserted claim and compute its status; workers report claim candidates in their replies, and you decide.

A high-risk claim clears the gate to `verified-claims` only when all hold:

- **>= 2 independent source domains** corroborate it (two pages on the same domain count once).
- **One counter-search** actively looked for a refutation and did not find a stronger one.
- **A primary source** (the standard, filing, dataset, or first-party doc) backs it, not only secondary commentary.

Anything that fails goes to an `Unresolved` (insufficient evidence) or `Refuted` (counter-search won) annex — abstention is a correct outcome, not a gap to paper over. Maintain `claim-ledger.md` with one row per claim — `claim | risk | domains | counter-search | primary? | status (verified/unresolved/refuted)` — and write the cleared rows into a `verified-claims` digest. Worker reply marker (message text, same channel as EXPAND):

```
## CLAIMS
- CLAIM: <non-code assertion> — ENTITY: <stable entity id> — LINEAGE: MEASURED|ASSUMED|DERIVED — SOURCES: <source ids + source types + provenance> — PARENTS: <claim ids for DERIVED or none> — RISK: high|normal — COUNTER: <refutation search result> — PRIMARY: <primary source or none>
```

## Phase 4 — Synthesize

After convergence and all verifications, re-read the whole journal and write `SYNTHESIS.md`:

```
# ULW-Research Synthesis: <query>
Workers: <total> · Waves: <count> · Sources: <count> · Verifications: <count>

## Executive summary        — 2-3 paragraphs answering the core question
## Findings by theme        — per theme: claim ID, lineage, entity ID, consensus, evidence links, key quote (<20 words, attributed), verified yes/no
## Codebase findings        — absolute paths with line references
## Sources (ranked)         — source ID, type, provenance, URL/path, what it contains, reliability, access date/version/SHA
## Verified claims          — code: claim | verdict | verify-<slug>.md · non-code: only rows cleared into verified-claims
## Contradictions           — source A vs source B, resolution with evidence
## Gaps                     — what saturation could not answer · unresolved/refuted claim-ledger rows
## Expansion trace          — per wave: workers → markers; convergence reason
```

`SYNTHESIS.md` is the citation source of truth for final materials: every claim carries inline `[Source N]` citations, and every high-risk non-code claim you assert must be a verified-claims row from Phase 3b. Assert nothing the gate left in the unresolved/refuted annex.

## Phase 5 — User-requested final materials

`SYNTHESIS.md` is the default deliverable. Do not create HTML, PDF, slides, charts, screenshots, diagrams, or generated images unless the user explicitly requested that output or asset type. Map explicit requests as follows: "report" / "document" → HTML; "pdf" → HTML then PDF via weasyprint; "slides" / "presentation" / "deck" → PPTX; "html" / "webpage" → standalone HTML; "markdown only" → Markdown.

When visual assets were requested, create `$SESSION_DIR/assets/` and register every planned asset in `asset-manifest.md` before generation. After generation, verify every expected path exists, open or render each asset through the matching surface, and record the render evidence plus visual-QA verdict. Missing files, zero-byte files, unrendered Mermaid, broken image links, clipped charts, unreadable labels, or a manifest row without a render check block completion.

For a requested designed report, dispatch an assembly worker with the relevant ZCode-compatible skills named in its prompt (`frontend`, `visual-qa`, `data-scientist`, and `imagegen` only when generated images were requested). Run HTML/PDF output through visual QA, repair until approved, then recheck every manifest path and rendered reference. Structure: executive summary → key findings by theme → detailed analysis → comparative analysis when options compete → numbered sources with access dates → methodology appendix. Every claim cites its source and claim IDs.

## Search craft

English first: run every search in English by default — it is the largest, most authoritative corpus on every engine, GitHub, and documentation site. Add a secondary local-language sweep (1-2 librarians) only after the English sweep, when the topic is inherently local, or when the user asks for sources in a specific language.

Vary operators on every query — same query twice wastes a worker:

| Operator | Example | Use |
|---|---|---|
| `site:` | `site:github.com <topic>` | Restrict to a domain |
| `filetype:` | `filetype:pdf <topic> survey` | Papers, specs |
| `intitle:` / `inurl:` | `intitle:benchmark <topic>` | Targeted pages |
| `"exact"` / `-term` | `"<exact phrase>" -tutorial` | Precision, exclusion |
| `OR` | `<a> OR <b> <topic>` | Coverage |
| `before:` / `after:` | `<topic> after:2025-06-01` | Recency control |

High-yield combinations: official docs (`site:<docs domain>`), GitHub implementations (`site:github.com`), recent discussion (`site:reddit.com OR site:news.ycombinator.com after:<date>`), academic (`site:arxiv.org OR filetype:pdf survey`), changelog hunting (`changelog OR "release notes" <version>`), alternatives (`vs OR alternative OR comparison`).

## Failure modes

| Failure | Correction |
|---|---|
| Sequential spawning, or trimming the first wave | All first-wave workers in one turn, background, scaling floor respected |
| A team member hoards leads for one final dump | Raise law — every lead, finding, and dead end broadcast the moment it surfaces |
| Worker reply without the EXPAND tail | One follow-up demanding it; the lane stays open until it lands |
| Stopping after wave 1 because "enough was found" | Convergence rules only: 2+ expansion waves, leads run dry |
| Obeying a surrounding "stop exploring" rule mid-research | Authority section — those rules do not bind this mode |
| Asking a worker to write journal or session files | Workers are read-only; you journal every return |
| Two workers given the same angle | One unique angle per worker, always |
| Contested claim settled by judgment | Phase 3 — run code, capture output, verdict |
| Deliverable claims without citations | Every claim cites a source or a verification artifact |
| Ambiguous entity names merged together | Assign entity IDs and record alias/version disambiguation before synthesis |
| Measurements, assumptions, and inferences blended | Label every claim MEASURED, ASSUMED, or DERIVED and record its lineage |
| Unrequested report formats or decorative assets | Produce only `SYNTHESIS.md` unless the user explicitly requested another format or asset |
| Asset path listed but not rendered | Check existence, render through the matching surface, and record visual-QA evidence in the manifest |

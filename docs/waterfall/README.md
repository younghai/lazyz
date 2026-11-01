# LazyZ Waterfall Documentation

> Baseline date: 2026-07-19
> Scope: `plugins/lazyz/` full plugin (Codex→ZCode port, Sprint 1-2, data governance, UX review)
> Source repository: https://github.com/younghai/lazyz

This document set organizes the LazyZ ZCode plugin from a waterfall deliverables
perspective. The implementation was already complete; each phase is an as-built
document traced back from the current code and operational evidence.

## Document Structure

| Phase | Stage | Documents | Purpose |
| --- | --- | --- | --- |
| 0 | Planning | [Service Planning](00-planning/service-planning.md), [Business Policy](00-planning/business-policy.md) | Product purpose, users, scope, KPI, operating policy |
| 1 | Requirements | [Requirements Spec](01-requirements/requirements.md), [Terminology](01-requirements/terminology.md) | Functional/nonfunctional requirements, constraints |
| 2 | System Design | [Architecture](02-system-design/system-architecture.md), [Data Flow](02-system-design/data-flow.md) | Architecture, components, data flow |
| 3 | Detailed Design | [Component Design](03-detailed-design/component-design.md), [State Machines](03-detailed-design/state-machines.md) | Module responsibilities, state flow, schema |
| 4 | Implementation | [Implementation Status](04-implementation/implementation.md) | File layout, implemented features, sprint history |
| 5 | QA | [QA Plan](05-qa/qa-plan.md), [Test Results](05-qa/test-results.md) | Verification strategy, release gate |
| 6 | Deployment | [Deployment Plan](06-deployment/deployment-plan.md), [Operations Guide](06-deployment/operations-guide.md) | Deployment procedure, rollback, environment |
| 7 | Maintenance | [Maintenance Plan](07-maintenance/maintenance.md) | Regular checks, backlog |
| 8 | Review | [Phase Checklist](08-review/phase-checklist.md), [Project Artifacts](08-review/project-artifacts.md) | Phase gates, consistency audit |
| 9 | Ops Runbook | [Data Governance](09-operations-runbook/data-governance.md), [Incident Response](09-operations-runbook/incident-response.md) | Operating procedures, incidents, recovery |
| 10 | Monitoring | [Monitoring/SLO](10-monitoring/monitoring-slo.md) | Metrics, alerts, visibility |

## Quick Facts

| Item | Value |
| --- | --- |
| Product | LazyZ |
| Type | ZCode plugin (agent harness) |
| Core value | Project memory, planning, execution, and verified completion as a single installable ZCode plugin |
| Origin | LazyCodex (Codex distribution) → OmO — oh-my-openagent |
| Language/Runtime | TypeScript, Node.js 20+, Bun (build) |
| Components | 25 skills, 10 agents, 16 hooks, 5 MCP servers, 4 commands |
| Repository | https://github.com/younghai/lazyz |
| Version | 0.10.2 |
| License | MIT |

## Operational Readiness Criteria

"Operationally ready" in this document set means all of the following are met:

1. The [Deployment Plan](06-deployment/deployment-plan.md) go/no-go gate is PASS.
2. ZCode marketplace registration is complete; skills/MCP/hooks load correctly.
3. [Data Governance](09-operations-runbook/data-governance.md) P0 items are resolved.
4. The [Incident Response](09-operations-runbook/incident-response.md) runbook matches the latest scope.
5. GitHub push is complete and installation verification has passed.

## Waterfall Operating Principles

1. Requirement changes start with `01-requirements/requirements.md`.
2. Design changes are reflected in both `02-system-design/` and `03-detailed-design/`.
3. Code changes update the file map in `04-implementation/implementation.md`.
4. Data schema changes enforce dual-parser sync via CI (`Verify boulder parser sync`).
5. All phase completion decisions are gated by `08-review/phase-checklist.md`.

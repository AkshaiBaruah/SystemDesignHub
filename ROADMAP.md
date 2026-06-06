# Roadmap
This is a future roadmap. Read this only if prompted else skip.

## 1 — Chaos Engineering (Simulation Interactions)

Live controls that inject failure modes into a running simulation. No backend required — all client-side state mutations.

| Switch | Behaviour |
|--------|-----------|
| **Traffic spike** | Multiply `concurrentUsers` by a configurable burst factor (e.g. 5×) for a configurable duration, then decay back. Currently hardcoded to +25%/45s; make it user-triggered and tunable. |
| **Component crash** | Select a node from a dropdown → zero out its outbound load propagation; downstream nodes see 0 inbound. Show a red "crashed" overlay on the node. |
| **Cache-miss storm** | Force all cache hit rates to 0% for a duration, causing full DB fallthrough. Configurable duration + which cache nodes are affected. |
| **Network partition** | Select an edge → sever it in the load propagation graph without removing it from canvas. Visually dashed. Downstream nodes compute load as if the edge doesn't exist. |
| **Latency injection** | Add a configurable latency multiplier on a node (e.g. 10× p99). Affects the latency metric displayed, not throughput. |

Implementation notes:
- Add a `chaosEvents: ChaosEvent[]` slice to `simulationStore`
- `tickSimulation` reads active events and applies overrides after the BFS pass
- UI: collapsible "Chaos" panel in `SimulationDrawer` with an "Inject" button per switch type and a duration slider

---

## 2 — Cost Estimation

Estimate monthly cloud cost alongside simulation metrics. Pure formula-based, no real pricing API calls.

- Cost models per component type (e.g. EC2 for Service, RDS for PostgreSQL, ElastiCache for Redis) stored as config in the client
- Cost displayed per node in `NodeMetricsPanel` and summed in a "Total estimated cost/mo" line in `SimulationDrawer`
- Configurable cloud provider (AWS / GCP / Azure) — affects per-unit prices
- Scales with instance count / node count params already in the schema

---

## 3 — Configuration Improvements

| Item | Detail |
|------|--------|
| **Global traffic shaping** | Replace the single `concurrentUsers` slider with a multi-segment traffic profile: ramp, steady, peak, valley. Drives `concurrentUsers` as a function of elapsed time. |
| **Per-API latency SLO** | Set a target p99 per API endpoint. SimulationDrawer highlights APIs breaching SLO in red. |
| **Edge bandwidth cap** | Set a max RPS on any canvas edge. Load propagation clamps at the cap and shows saturation warning. |
| **Component grouping / regions** | Visual grouping of nodes into named regions (e.g. "US-East", "EU-West"). Replicated groups run in parallel in load math. |
| **Custom component params** | Freeform key-value overrides on any node that feed into the simulation engine as multipliers. |

---

## 4 — Real-time Collaboration

- Replace the current per-user in-memory Zustand store with a shared document synced over WebSockets (e.g. `y-websocket` + Yjs CRDT, or Liveblocks)
- Presence cursors on canvas (coloured per user)
- Named sessions (design stays at `/design/:id`, multiple users join it)
- Conflict-free concurrent node moves and param edits via CRDT
- Server-side: add a `users` table for named sessions; WebSocket server alongside Express (or use a separate WS process)

---

## 5 — Design Versioning & Diff

- `design_versions` table: snapshot `canvas_json` on every manual save or analysis run
- Version history panel: list snapshots with timestamps, restore any version
- Visual diff view: nodes/edges added/removed highlighted in green/red between two versions

---

## 6 — Template Library

- Expand the single hardcoded template to a curated library: Event-Driven, CQRS, Read-Heavy, Write-Heavy, Multi-Region Active-Active, etc.
- Templates selectable from a "New Design" modal
- Community-submitted templates via a `shared_templates` table + a public flag on designs

---

## 7 — AI Analysis Improvements

| Item | Detail |
|------|--------|
| **Send simulation metrics to Claude** | Include live `nodeMetrics` and `apiBreakdown` in the analysis payload so Claude can reason about observed utilization, not just topology |
| **Send API interaction config** | Include `ApiDef` objects so Claude understands cache hit rates, query fan-out, fallthrough chains |
| **Iterative Q&A** | After initial analysis, allow follow-up questions in a chat thread anchored to the same design snapshot |
| **Diff analysis** | "What changed?" between two design versions — send both snapshots, ask Claude to summarise the architectural delta and its implications |

---

## 8 — Export & Embed

- Export canvas as PNG / SVG
- Export analysis as PDF report
- Export design as Terraform / Pulumi skeleton (stub resources matching canvas nodes)
- Embeddable iframe for sharing a read-only animated simulation view

---

## 9 — Auth & Multi-Tenancy

- OAuth login (Google / GitHub) — designs scoped to a user account
- Public / private / team visibility per design
- Org-level shared component library (custom components per org)

---

## Priority order (suggested)

1. Chaos Engineering — highest demo value, low backend surface
2. Configuration improvements (traffic shaping, SLO, edge caps)
3. Cost estimation — adds immediate tangible output
4. AI analysis improvements — raises quality of the core differentiator
5. Design versioning — foundational for collaboration
6. Real-time collaboration — requires the most infrastructure investment
7. Template library, export, auth

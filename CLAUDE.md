# System Design Simulator — CLAUDE.md

Browser-based tool for composing distributed system designs visually, simulating load, and getting AI-powered architectural analysis.

---

## Running the project

```bash
# Install all dependencies (npm workspaces)
npm install

# Start both servers concurrently
npm run dev
```

- **Frontend**: http://localhost:5173 (Vite + React)
- **Backend**: http://localhost:3001 (Express)

The server uses `tsx watch` so it hot-reloads on file saves. Vite handles HMR on the client.

---

## Environment

`server/.env` is required (not committed). Copy from `server/.env.example`:

```
DATABASE_URL=postgresql://akshai.b@localhost:5432/sys_design
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

The Anthropic API key is **server-side only** — it never reaches the client. The analyze endpoint receives only `{ designId }` and fetches canvas state from the DB itself.

---

## Database setup (one-time)

PostgreSQL runs locally via Homebrew as user `akshai.b` (no password). Database: `sys_design`.

```bash
# Create DB (already done)
psql -U akshai.b postgres -c "CREATE DATABASE sys_design;"

# Generate + apply migrations (run from server/)
cd server
DATABASE_URL=postgresql://akshai.b@localhost:5432/sys_design \
  /path/to/root/node_modules/.bin/drizzle-kit generate
DATABASE_URL=postgresql://akshai.b@localhost:5432/sys_design \
  /path/to/root/node_modules/.bin/drizzle-kit migrate

# Seed the 20 component definitions
npm run db:seed
```

**Important**: `drizzle-kit` is hoisted to the root `node_modules/.bin/` (not `server/node_modules/.bin/`). Run migration commands from `server/` directory but using the root binary path.

**Re-seeding**: When component params change, truncate and re-seed:
```bash
psql postgresql://akshai.b@localhost:5432/sys_design -c "TRUNCATE components;"
cd server && npm run db:seed
```
The `/api/components` response is cached for 5 minutes server-side; restart the server after re-seeding to bust the cache.

---

## Architecture

### Monorepo layout

```
sys/
├── package.json          # workspace root (workspaces: ["client", "server"])
├── client/               # Vite + React 18 + TypeScript
└── server/               # Node.js + Express + TypeScript
```

### Backend (`server/src/`)

| File | Purpose |
|------|---------|
| `index.ts` | Express app, CORS, body parser, mounts routes |
| `db/schema.ts` | Drizzle ORM tables: `components`, `designs`, `analyses` |
| `db/seed.ts` | Seeds 20 component definitions |
| `lib/anthropic.ts` | Anthropic SDK singleton (reads `ANTHROPIC_API_KEY`) |
| `lib/validation.ts` | Zod schemas for all request bodies |
| `routes/components.ts` | `GET /api/components` — returns all component defs, cached 5min |
| `routes/designs.ts` | `POST /api/designs`, `GET /api/designs/:id`, `PATCH /api/designs/:id`, `POST /api/designs/from-template` |
| `routes/validate.ts` | `POST /api/validate` — checks required params + edge acceptsFrom constraints |
| `routes/analyze.ts` | `POST /api/analyze` — validates → fetches design → calls Claude → stores result |

### Frontend (`client/src/`)

| Path | Purpose |
|------|---------|
| `App.tsx` | Three-column layout (library / canvas / config) + bottom drawers |
| `store/designStore.ts` | Zustand store: nodes, edges, sync, undo/redo history |
| `store/simulationStore.ts` | Zustand store: simulation status, API defs, per-node metrics |
| `simulation/engine.ts` | Client-side load propagation engine + per-component metric formulas |
| `simulation/types.ts` | `ApiDef`, `NodeMetrics`, `MetricSpec`, `COMPONENT_SPECS` map |
| `lib/api.ts` | Typed fetch wrappers for all backend endpoints |
| `lib/types.ts` | Shared TypeScript interfaces |
| `components/canvas/` | `DesignCanvas`, `ComponentNode`, `SyncToolbar` |
| `components/config/` | `ConfigPanel`, `NodeConfig`, field components |
| `components/library/` | `ComponentLibrary`, `CategorySection`, `ComponentCard` |
| `components/analysis/` | `AnalysisDrawer`, `AnalysisContent`, `ScoreGauge` |
| `components/simulation/` | `SimulationDrawer`, `NodeMetricsPanel`, `Sparkline` |
| `components/ui/` | shadcn/ui primitives (written manually, not CLI-generated) |

---

## Key design decisions

### State sync
- **Structural changes** (add/delete node or edge): synced to backend immediately via `PATCH /api/designs/:id`
- **Param/position/label changes**: debounced 1.5s via a module-level `setTimeout` (not `useRef`) to avoid Zustand closure issues
- Sync status shown in toolbar: `saving → saved → idle` or `error`

### Undo/redo
- History stack lives in `designStore` (`past[]` and `future[]`, capped at 50 entries)
- Snapshots taken before: `addNode`, `deleteNode`, `addEdge`, `deleteEdge`
- Param changes snapshot at most once per second (throttled to avoid flooding history on fast typing)
- Keyboard: `⌘Z` / `Ctrl+Z` = undo, `⌘⇧Z` / `Ctrl+Y` = redo

### Simulation engine

Two-layer model:

**Layer 1 — Graph topology (BFS)**: Load propagates from root nodes (Client, or nodes with no incoming edges) through edges. This drives metrics on infrastructure nodes: Client, Load Balancer, API Gateway, Service, Serverless.

**Layer 2 — API interactions (explicit override)**: After BFS, DB and cache node loads are overridden with values computed directly from the API interaction config. **If no interaction is defined for a DB or cache node, it shows 0 load** — graph edges alone do not drive metrics on these nodes.

Key properties:
- Pure client-side — no backend calls during simulation
- Runs on `setInterval` (1 tick/sec), stored in a module-level variable in `simulationStore.ts`
- Metrics use deterministic sin-wave noise (multiple frequencies + per-node phase offset) so curves look live without jumping
- Traffic spikes: +25% burst every 45 seconds for 8 seconds
- Cache warm-up: hit rates start cold and ramp over ~25 seconds
- Series history: last 60 data points per metric per node

### API interactions

Each API endpoint (`ApiDef`) can define:

**Cache interactions** (`CacheInteraction[]`):
- `operation`: `"read"` or `"write"`
- `nodeId`: target Redis/Memcached node on the canvas
- `keyPattern`: documentation only (e.g. `feed:{userId}`)
- `ttlSeconds`: key TTL (affects hit rate math)
- `fanoutFactor`: writes per request (1 = no fan-out, 500 = fan-out to followers)
- `uniqueKeys`: key space size (affects hit rate for linked reads)
- `populatedBy`: links a read to a write interaction from another API — hit rate computed via Poisson coverage model (`1 - e^(-λ·TTL)`) instead of the standalone target rate
- `targetHitRatePct`: steady-state hit rate for standalone reads

**DB interactions** (`DbInteraction[]`):
- `nodeId`: target DB node on the canvas
- `queriesPerRequest`: DB queries fired per API request
- `readFraction`: fraction of those queries that are reads (0–1)
- `cacheFallthrough`: if true, only hits DB on cache miss
- `cacheInteractionId`: links to a cache read interaction to get the miss rate

The interaction picker in the simulation drawer shows edges as **"Source → Target"** labels (e.g. "Service → PostgreSQL") so only connections that actually exist on the canvas are selectable.

### Cache hit rate computation

- **Standalone read** (`populatedBy` not set): `hitRate = (targetHitRatePct / 100) * warmup - churnPenalty`. Churn penalty grows with high RPS relative to TTL. Warmup ramps over `min(TTL, 60)` seconds.
- **Linked read** (`populatedBy` set to a write interaction): Poisson model — `hitRate = (1 - e^(-λ·TTL)) * warmup` where `λ = writeRps × fanoutFactor / uniqueKeys`. Longer TTL, more writes, or smaller key space → higher hit rate.
- **Cache outbound RPS** (what flows to downstream DB): `inRps × (writeFrac + readFrac × (1 - hitRate))` — write traffic and read misses pass through.

### React Flow v12
- **Controlled mode**: `nodes`/`edges` props driven by Zustand store
- Custom node type: `componentNode` → `ComponentNode.tsx`
- `ConnectionLineType.SmoothStep` (enum, not string literal)
- `onNodeDragStop` and `onNodeClick` type `_e: unknown` (React Flow v12 event type mismatch)
- `ReactFlowProvider` wraps the canvas in `App.tsx`
- No `StrictMode` in `main.tsx` (React Flow incompatibility)

### Anthropic integration
- Model: `claude-sonnet-4-20250514`
- Tool: `{ type: "web_search_20250305", name: "web_search" }` cast `as any` (SDK typing gap)
- Response: expects raw JSON (no markdown); engine tries stripping fences then regex extracts `{...}` as fallback
- Analysis result persisted to `analyses` table

### Component taxonomy
20 components seeded across 7 categories:

| Category | Components |
|----------|-----------|
| Queues | Kafka, SQS, RabbitMQ |
| Databases | PostgreSQL, MySQL, Cassandra, DynamoDB, MongoDB |
| Cache | Redis, Memcached |
| Search | Elasticsearch |
| Compute | Service/Microservice, Serverless Function |
| Infrastructure | Load Balancer, API Gateway, CDN, Object Storage, Client |
| Streaming | Kinesis, EventBridge |

Each has: `params[]` (schema-driven config fields), `cardSummary[]` (keys shown on canvas card), `acceptsFrom[]` (valid source component IDs, enforced client + server-side).

### Edge validation
- **Client-side**: `onConnect` in `DesignCanvas` checks `targetDef.acceptsFrom` before adding the edge; dispatches `edge-rejected` custom event on failure
- **Server-side**: `runValidation()` in `validate.ts` re-checks all edges against `acceptsFrom` before analysis

---

## Adding a new component type

1. **Seed** (`server/src/db/seed.ts`): add entry to `componentData[]` with `id`, `category`, `label`, `color`, `icon`, `params[]`, `cardSummary[]`, `acceptsFrom[]`
2. **Simulation metrics** (`client/src/simulation/types.ts`): add entry to `COMPONENT_SPECS` with metric definitions
3. **Simulation engine** (`client/src/simulation/engine.ts`): add `case "yourId":` in `computeNodeMetrics` switch and implement the metric formula function. If the component is a DB or cache variant, add its `defId` to `DB_COMPONENT_IDS` or `CACHE_COMPONENT_IDS` so interaction-based load overrides apply.
4. **Re-seed**: truncate the `components` table and re-run `npm run db:seed`

---

## API surface

| Method | Path | Body | Returns |
|--------|------|------|---------|
| GET | `/api/components` | — | `{ components: ComponentDef[] }` |
| POST | `/api/designs` | `{}` | `{ id, shareUrl }` |
| POST | `/api/designs/from-template` | `{}` | `{ id }` (loads Client→LB→API GW→Service→PG) |
| GET | `/api/designs/:id` | — | `Design` |
| PATCH | `/api/designs/:id` | `{ name?, canvas? }` | `{ updatedAt }` |
| POST | `/api/validate` | `{ designId }` | `{ valid, errors[], edgeErrors[] }` |
| POST | `/api/analyze` | `{ designId }` | `AnalysisResult` (score, spofs, warnings, ...) |

---

## TypeScript compilation

```bash
# Check client
cd client && npx tsc --noEmit

# Check server
cd server && npx tsc --noEmit

# Build client
cd client && npx vite build
```

Both must compile with zero errors before shipping changes.

---

## Param field types

Config panel renders fields based on `param.type`:

| Type | Component | Notes |
|------|-----------|-------|
| `int` | `SliderField` | requires `range: [min, max]` |
| `enum` | `SelectField` | requires `options: string[]` |
| `bool` | `ToggleField` | Radix Switch |
| `text` | `TextField` | plain input |
| `text[]` | `TagInputField` | Enter to add tags |
| `textarea` | `TextareaField` | monospace, multiline |

Conditional visibility: `showWhen: { key: string, value: unknown }` — field only renders when another param matches the value (e.g., DynamoDB RCU/WCU only when `billing_mode === "Provisioned"`).

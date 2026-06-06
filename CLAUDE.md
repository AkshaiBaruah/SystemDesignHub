# System Design Simulator — CLAUDE.md

Browser-based tool for composing distributed system designs visually, simulating load, and getting AI-powered architectural analysis.

---

## Running the project

```bash
npm install
npm run dev
```

- **Frontend**: http://localhost:5173 (Vite + React)
- **Backend**: http://localhost:3001 (Express)

---

## Environment

`server/.env` (not committed):
```
DATABASE_URL=postgresql://akshai.b@localhost:5432/sys_design
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

---

## Database

PostgreSQL local, user `akshai.b`, no password, db `sys_design`.

```bash
# Migrations (from server/, using root binary)
DATABASE_URL=... /path/to/root/node_modules/.bin/drizzle-kit generate
DATABASE_URL=... /path/to/root/node_modules/.bin/drizzle-kit migrate

# Seed / re-seed
psql postgresql://akshai.b@localhost:5432/sys_design -c "TRUNCATE components;"
cd server && npm run db:seed
```

`/api/components` is cached 5min — restart the server after re-seeding.

---

## Architecture

### Monorepo

```
sys/
├── package.json          # workspaces: ["client", "server"]
├── client/               # Vite + React 18 + TypeScript
└── server/               # Node.js + Express + TypeScript
```

### Backend (`server/src/`)

| File | Purpose |
|------|---------|
| `index.ts` | Express app, CORS, body parser, routes |
| `db/schema.ts` | Drizzle tables: `components`, `designs`, `analyses` |
| `db/seed.ts` | Seeds 20 component definitions |
| `lib/anthropic.ts` | Anthropic SDK singleton |
| `routes/components.ts` | `GET /api/components` — cached 5min |
| `routes/designs.ts` | CRUD for designs |
| `routes/validate.ts` | `POST /api/validate` — param + edge checks |
| `routes/analyze.ts` | `POST /api/analyze` — validate → Claude → persist |

### Frontend (`client/src/`)

| Path | Purpose |
|------|---------|
| `App.tsx` | Three-column layout + bottom drawers |
| `store/designStore.ts` | Nodes, edges, sync, undo/redo |
| `store/simulationStore.ts` | Simulation status, API defs, per-node metrics |
| `simulation/engine.ts` | Load propagation + per-component metric formulas |
| `simulation/types.ts` | `ApiDef`, `CacheInteraction`, `DbInteraction`, `COMPONENT_SPECS` |
| `components/canvas/` | `DesignCanvas`, `ComponentNode`, `SyncToolbar` |
| `components/config/` | `ConfigPanel`, `NodeConfig`, field components |
| `components/library/` | `ComponentLibrary`, `CategorySection`, `ComponentCard` |
| `components/analysis/` | `AnalysisDrawer`, `AnalysisContent`, `ScoreGauge` |
| `components/simulation/` | `SimulationDrawer`, `NodeMetricsPanel`, `Sparkline` |

---

## Simulation engine

Pure client-side — no backend calls during simulation.

### Two-layer load model

**Layer 1 — Graph BFS:** Load flows from root nodes (Client) through canvas edges. Drives infrastructure: Load Balancer, API Gateway, Service, Serverless.

**Layer 2 — API interactions:** DB and cache nodes get load computed directly from the interaction config. **No interactions = 0 load.** Canvas edges alone do not drive DB/cache metrics.

Implementation: `tickSimulation` runs BFS via `propagateLoad`, then overrides `loadMap` for all nodes in `DB_COMPONENT_IDS` and `CACHE_COMPONENT_IDS` using `computeDbInteractionLoad` / `computeCacheInteractionLoad`.

### API interactions (per `ApiDef`)

**Cache (`CacheInteraction[]`)**
- `nodeId` — target Redis/Memcached node
- `operation` — `"read"` or `"write"`
- `ttlSeconds`, `fanoutFactor`, `uniqueKeys` — drive hit rate math
- `populatedBy` — links a read to a write interaction; hit rate uses Poisson model: `1 − e^(−λ×TTL)` where `λ = writeRps × fanout / uniqueKeys`
- `targetHitRatePct` — used for standalone reads (no `populatedBy`)

**DB (`DbInteraction[]`)**
- `nodeId` — target DB node
- `queriesPerRequest` — multiplied by API RPS to get QPS
- `readFraction` — splits load into read vs write QPS
- `cacheFallthrough` + `cacheInteractionId` — only queries DB on cache miss; uses linked interaction's hit rate

The interaction picker in `SimulationDrawer` shows edges as **"Source → Target"** labels so only actual canvas connections are selectable.

### Key gotchas
- No `StrictMode` in `main.tsx` (React Flow incompatibility)
- `ConnectionLineType.SmoothStep` — enum not string literal
- Structural canvas changes sync immediately; param/position changes debounce 1.5s (module-level timer, not `useRef`)
- Anthropic web_search tool cast `as any` (SDK typing gap)
- API key never leaves server; analyze endpoint only accepts `{ designId }`

---

## API surface

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/components` | `{ components: ComponentDef[] }` |
| POST | `/api/designs` | `{ id, shareUrl }` |
| POST | `/api/designs/from-template` | `{ id }` |
| GET | `/api/designs/:id` | `Design` |
| PATCH | `/api/designs/:id` | `{ updatedAt }` |
| POST | `/api/validate` | `{ valid, errors[], edgeErrors[] }` |
| POST | `/api/analyze` | `AnalysisResult` |

---

## Component taxonomy

20 components across 7 categories:

| Category | Components |
|----------|-----------|
| Queues | Kafka, SQS, RabbitMQ |
| Databases | PostgreSQL, MySQL, Cassandra, DynamoDB, MongoDB |
| Cache | Redis, Memcached |
| Search | Elasticsearch |
| Compute | Service/Microservice, Serverless Function |
| Infrastructure | Load Balancer, API Gateway, CDN, Object Storage, Client |
| Streaming | Kinesis, EventBridge |

---

## Param field types

| Type | Component |
|------|-----------|
| `int` | `SliderField` (requires `range: [min, max]`) |
| `enum` | `SelectField` (requires `options: string[]`) |
| `bool` | `ToggleField` |
| `text` | `TextField` |
| `text[]` | `TagInputField` |
| `textarea` | `TextareaField` |

`showWhen: { key, value }` — conditional field visibility.

---

## TypeScript compilation

```bash
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit
```

Both must pass with zero errors.

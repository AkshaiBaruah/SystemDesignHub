# System Design Simulator

A browser-based tool for composing distributed system designs on a canvas, simulating traffic load, and getting AI-powered architectural analysis.

---

## Quick start

```bash
npm install
cp server/.env.example server/.env   # fill in DATABASE_URL and ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:5173.

---

## Prerequisites

- Node.js 18+
- PostgreSQL running locally (or set `DATABASE_URL` to a remote instance)
- Anthropic API key

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Anthropic API key (server-side only, never sent to client) |
| `PORT` | Backend port (default: 3001) |
| `CORS_ORIGIN` | Allowed CORS origin (default: http://localhost:5173) |

## Database setup (one-time)

```bash
cd server
npx drizzle-kit generate && npx drizzle-kit migrate
npm run db:seed
```

When component params change, re-seed:
```bash
psql postgresql://akshai.b@localhost:5432/sys_design -c "TRUNCATE components;"
cd server && npm run db:seed
# Restart the server to bust the 5-min /api/components cache
```

---

## Functionalities

### Canvas & component library

| Feature | Notes |
|---------|-------|
| Drag components from the left panel onto the canvas | 20 components across 7 categories |
| Edge validation — only valid connections allowed | Enforced both client-side (on connect) and server-side (before analysis) |
| Config panel — schema-driven sliders, dropdowns, toggles per component | Fields rendered from `params[]` schema in DB |
| Canvas auto-saved to PostgreSQL | Structural changes sync immediately; param/position changes debounce 1.5s |
| Undo / redo | ⌘Z / ⌘⇧Z, capped at 50 history entries |
| Shareable URL | Every design gets a permanent `/design/:id` URL |
| Template design | Pre-built Client → LB → API GW → Service → PostgreSQL |

---

### Simulation engine

The simulation is **entirely client-side**. No real traffic is generated. Numbers are computed from formulas driven by component params and API interaction config.

#### Two-layer load model

**Layer 1 — Graph topology (BFS):** Load flows from root nodes (Client) through canvas edges. Drives infrastructure node metrics: Load Balancer, API Gateway, Service, Serverless.

**Layer 2 — API interactions (explicit):** DB and cache node loads are computed entirely from the interaction config you define per API. **If no interaction is defined for a node, it shows 0 load** — canvas edges alone do not drive DB or cache metrics.

#### API interaction config (per endpoint)

Each simulated API endpoint can define:

**Cache interactions**
- Target a Redis or Memcached node via a canvas connection picker ("Service → Redis")
- Operation: `read` or `write`
- Key pattern (documentation only)
- TTL, fan-out factor, unique key space
- Link a read to a write interaction from another API — hit rate computed via Poisson coverage model (`1 − e^(−λ×TTL)`) so the write's fan-out and TTL drive the read's hit rate

**DB interactions**
- Target a DB node via a canvas connection picker ("Service → PostgreSQL")
- Queries per request (multiplies the API's RPS)
- Read fraction (splits query load into read vs write QPS)
- Cache fallthrough — link to a cache read interaction so only misses hit the DB

#### What params actually affect simulation

| Component | Params that drive simulation math |
|-----------|----------------------------------|
| Load Balancer | `max_throughput_rps` — utilization = inRps / maxThroughput |
| API Gateway | `rate_limit_rps`, `caching` (bool, reduces outbound RPS by 35%) |
| Service | `instances` — capacity = instances × 500 RPS |
| Serverless | `timeout_sec` (affects duration metric), `reserved_concurrency` (capacity cap) |
| PostgreSQL / MySQL | `connection_pool_size` (capacity + connection metric), `read_replicas` (adds read capacity) |
| Redis | `nodes` (ops/s capacity) |
| DynamoDB | `billing_mode`, `rcu`, `wcu` (throttling only triggers in Provisioned mode) |
| Cassandra | `nodes` (capacity), `consistency_level` (latency multiplier: ONE=1×, QUORUM=1.8×, ALL=2.5×) |
| MongoDB | `shards` (capacity), `replica_set_size` (replication lag metric) |
| Elasticsearch | `nodes` (capacity) |
| Kafka | `brokers` (capacity = brokers × 150K msg/s) |
| RabbitMQ | `nodes` (capacity = nodes × 50K msg/s) |
| Kinesis | `shards` (capacity = shards × 1K rec/s) |

#### What is hardcoded or not driven by params

| Feature | Detail |
|---------|--------|
| **Noise on all metrics** | Deterministic sin-wave layered on every value: `amplitude × (0.5·sin(0.4t) + 0.3·sin(1.1t) + 0.2·sin(2.7t))`. Amplitudes are hardcoded percentages per component. |
| **Traffic spikes** | +25% burst every 45s for 8s. Interval and magnitude are hardcoded. |
| **Ramp-up** | All metrics ramp from 0 over 10 seconds. The 10s window is hardcoded. |
| **Cache warm-up** | Hit rates ramp over `min(TTL, 60)` seconds. Works correctly for configured interactions. |
| **CDN hit rate** | Ramps from 85% to 93% on a fixed schedule regardless of `cache_ttl_sec`. The TTL param has no effect on simulation. |
| **CDN origin pass-through** | Hardcoded 15% of inbound RPS flows to origin, regardless of hit rate ramp. |
| **Serverless cold start rate** | `invocations × 0.05 × (1 − warmup)`. The 5% fraction is hardcoded. `runtime` and `memory_mb` params have no effect. |
| **API Gateway cache hit % metric** | Oscillates 20–55% when caching is enabled. `cache_ttl_sec` param does not affect this number. |
| **SQS / RabbitMQ consumer behaviour** | Dequeue rate is always 95–97% of enqueue rate. No consumer config. |
| **Kafka consumer lag** | Grows when throughput exceeds broker capacity; otherwise drains. Consumer count and group config are not modelled. |
| **Kafka/Kinesis/SQS params** | `partitions_per_topic`, `replication_factor`, `retention_hours`, `dlq_*`, `visibility_timeout` — visible in config panel but have no effect on simulation math. |
| **Redis maxmemory** | `maxmemory` param in config does not affect `memory_used_pct` in simulation. |
| **Object Storage growth** | `storage_gb = 100 + elapsed × RPS × 0.0001`. Growth constant is made up. `versioning` and `replication` params have no effect. |
| **EventBridge rules** | `matched_pct` oscillates ~65%, `failed_pct` ~0.1%. Rule and target config is not modelled. |
| **Replication lag formulas** | PostgreSQL/MySQL/MongoDB: `lag = utilization × hardcodedConstant + noise`. |
| **Error rates** | Service and Serverless errors only appear above ~85–90% utilization. Always 0 below that. |
| **Load Balancer algorithm** | `algorithm` param (Round Robin, Least Connections, etc.) has no effect on simulation. |
| **LB / API GW SSL, WAF, sticky sessions** | Params visible in config but do not change any metric. |
| **Cassandra compaction** | `compaction_pending = utilization × 15 + noise`. Not driven by data volume or write rate. |
| **MongoDB connection count** | `connections = utilization × 200 + noise`. Not driven by `connection_pool_size` (that param is not in MongoDB's schema). |

---

### AI analysis

| Feature | Notes |
|---------|-------|
| Calls Claude (`claude-sonnet-4-20250514`) with web search enabled | Real API call, billed per use |
| Returns score, SPOFs, bottlenecks, warnings, missing components, suggestions, summary | Structured JSON |
| Clicking a SPOF / bottleneck highlights the node on canvas | Wired to `selectNode` in design store |
| Validation gate before analysis | Required params + edge constraints checked server-side first |
| Result persisted to `analyses` table | Can be retrieved later |
| Analysis sees live simulation metrics | **No** — Claude only receives canvas topology and component params |
| Analysis sees API interaction config | **No** — `ApiDef` objects (weights, interactions) are not sent to Claude |

---

## Architecture

- **Frontend**: Vite + React 18 + TypeScript, `@xyflow/react` v12 canvas, Zustand state
- **Backend**: Node.js + Express, drizzle-orm + PostgreSQL, `@anthropic-ai/sdk`
- **Monorepo**: npm workspaces (`client/`, `server/`)
- **Simulation**: Pure client-side, no backend calls during simulation

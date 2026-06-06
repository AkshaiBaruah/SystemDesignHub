import type { Node, Edge } from "@xyflow/react";
import type { DesignNodeData } from "@/lib/types";
import type { ApiDef, CacheInteraction, NodeMetrics, MetricPoint, ApiBreakdown } from "./types";
import { COMPONENT_SPECS } from "./types";

// ── Noise helpers ─────────────────────────────────────────────────────────────

function wave(elapsed: number, freq: number, phase: number): number {
  return Math.sin(elapsed * freq + phase);
}

function smooth(elapsed: number, phase: number, amplitude: number): number {
  return amplitude * (
    0.5 * wave(elapsed, 0.4, phase) +
    0.3 * wave(elapsed, 1.1, phase * 1.7) +
    0.2 * wave(elapsed, 2.7, phase * 0.5)
  );
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function spikeFactor(elapsed: number): number {
  const t = elapsed % 45;
  if (t < 8) return 1 + 0.25 * Math.sin((t / 8) * Math.PI);
  return 1;
}

function ramp(elapsed: number, rampSecs = 10): number {
  return Math.min(1, elapsed / rampSecs);
}

function cacheWarmup(elapsed: number): number {
  return Math.min(1, elapsed / 25);
}

// ── Cache hit rate computation ────────────────────────────────────────────────

// Standalone read: uses targetHitRatePct with TTL churn penalty and warmup
function standaloneHitRate(interaction: CacheInteraction, rps: number, elapsed: number): number {
  const base = interaction.targetHitRatePct / 100;
  const expiryRate = rps / Math.max(1, interaction.ttlSeconds);
  const churnPenalty = clamp(expiryRate / 50, 0, 0.4);
  const warmupSecs = Math.min(interaction.ttlSeconds, 60);
  const warmup = Math.min(1, elapsed / Math.max(warmupSecs, 5));
  return clamp(base - churnPenalty, 0.05, 0.97) * warmup;
}

// Read populated by a write interaction: Poisson coverage model.
// hitRate = 1 - e^(-λ·TTL) where λ = writeRps·fanout / uniqueKeys
// Intuition: longer TTL or more writes → more live keys → higher hit probability.
function linkedHitRate(
  writeInteraction: CacheInteraction,
  writeApiRps: number,
  elapsed: number
): number {
  const keysPerSec = writeApiRps * Math.max(1, writeInteraction.fanoutFactor);
  const space = Math.max(1, writeInteraction.uniqueKeys);
  const λ = keysPerSec / space;
  const hitProb = 1 - Math.exp(-λ * writeInteraction.ttlSeconds);
  const warmupSecs = clamp(writeInteraction.ttlSeconds * 3, 5, 120);
  const warmup = Math.min(1, elapsed / warmupSecs);
  return clamp(hitProb * warmup, 0.01, 0.97);
}

// Compute effective read hit rate for a cache node from API interactions.
// Returns null if no APIs have read interactions targeting this node.
export function apiCacheHitRate(
  nodeId: string,
  apis: ApiDef[],
  concurrentUsers: number,
  elapsed: number
): number | null {
  const totalWeight = apis.reduce((s, a) => s + a.weight, 0) || 1;

  const readApis = apis.filter((a) =>
    a.cacheInteractions.some((c) => c.nodeId === nodeId && c.operation === "read")
  );
  if (readApis.length === 0) return null;

  const readWeight = readApis.reduce((s, a) => s + a.weight, 0) || 1;
  let weightedHitRate = 0;

  for (const api of readApis) {
    const apiRps = concurrentUsers * (api.weight / totalWeight);
    const read = api.cacheInteractions.find((c) => c.nodeId === nodeId && c.operation === "read")!;

    let hitRate: number;
    if (read.populatedBy) {
      let writeInteraction: CacheInteraction | undefined;
      let writeApiRps = 0;
      for (const a of apis) {
        const wi = a.cacheInteractions.find((c) => c.id === read.populatedBy);
        if (wi) {
          writeInteraction = wi;
          writeApiRps = concurrentUsers * (a.weight / totalWeight);
          break;
        }
      }
      hitRate = writeInteraction
        ? linkedHitRate(writeInteraction, writeApiRps, elapsed)
        : standaloneHitRate(read, apiRps, elapsed);
    } else {
      hitRate = standaloneHitRate(read, apiRps, elapsed);
    }

    weightedHitRate += hitRate * (api.weight / readWeight);
  }

  return clamp(weightedHitRate, 0, 0.97);
}

// ── Sets of component IDs that use interaction-based load ─────────────────────

const DB_COMPONENT_IDS = new Set([
  "postgresql", "mysql", "cassandra", "dynamodb", "mongodb", "elasticsearch",
]);
const CACHE_COMPONENT_IDS = new Set(["redis", "memcached"]);

// Compute the QPS a DB node receives purely from API dbInteractions.
// Returns rps=0 if no API has an interaction targeting this node.
function computeDbInteractionLoad(nodeId: string, ctx: EngineCtx): NodeLoad {
  const { apis, concurrentUsers, cacheHitRates } = ctx;
  const totalWeight = apis.reduce((s, a) => s + a.weight, 0) || 1;
  let totalQps = 0;
  let weightedReadFrac = 0;
  let matchWeight = 0;

  for (const api of apis) {
    const di = api.dbInteractions.find((d) => d.nodeId === nodeId);
    if (!di) continue;
    const apiRps = concurrentUsers * (api.weight / totalWeight);
    let effectiveQpr = di.queriesPerRequest;
    if (di.cacheFallthrough && di.cacheInteractionId) {
      const cacheInt = apis
        .flatMap((a) => a.cacheInteractions)
        .find((c) => c.id === di.cacheInteractionId);
      if (cacheInt) {
        effectiveQpr *= 1 - (cacheHitRates.get(cacheInt.nodeId) ?? 0);
      }
    }
    totalQps += apiRps * effectiveQpr;
    weightedReadFrac += di.readFraction * api.weight;
    matchWeight += api.weight;
  }

  if (matchWeight === 0) return { rps: 0, readFrac: 0.8 };
  return { rps: totalQps, readFrac: weightedReadFrac / matchWeight };
}

// Compute ops/s a cache node receives purely from API cacheInteractions.
// Reads contribute 1 op/req; writes contribute fanoutFactor ops/req.
// Returns rps=0 if no API has an interaction targeting this node.
function computeCacheInteractionLoad(nodeId: string, ctx: EngineCtx): NodeLoad {
  const { apis, concurrentUsers } = ctx;
  const totalWeight = apis.reduce((s, a) => s + a.weight, 0) || 1;
  let totalOps = 0;

  for (const api of apis) {
    const apiRps = concurrentUsers * (api.weight / totalWeight);
    for (const ci of api.cacheInteractions) {
      if (ci.nodeId !== nodeId) continue;
      totalOps +=
        ci.operation === "write"
          ? apiRps * Math.max(1, ci.fanoutFactor)
          : apiRps;
    }
  }

  return { rps: totalOps, readFrac: 0.5 };
}

// ── Load propagation ──────────────────────────────────────────────────────────

interface NodeLoad {
  rps: number;
  readFrac: number;
}

interface EngineCtx {
  apis: ApiDef[];
  concurrentUsers: number;
  elapsed: number;
  cacheHitRates: Map<string, number>; // precomputed: nodeId → effective hit rate
}

export function propagateLoad(
  nodes: Node<DesignNodeData>[],
  edges: Edge[],
  ctx: EngineCtx
): Map<string, NodeLoad> {
  const loadMap = new Map<string, NodeLoad>();
  const { apis, concurrentUsers } = ctx;

  const totalWeight = apis.reduce((s, a) => s + a.weight, 0) || 1;
  const baseRps = concurrentUsers;
  const readWeight = apis.filter((a) => a.method === "GET").reduce((s, a) => s + a.weight, 0);
  const globalReadFrac = readWeight / totalWeight;

  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();
  for (const n of nodes) {
    inDegree.set(n.id, 0);
    outEdges.set(n.id, []);
  }
  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    outEdges.get(e.source)?.push(e.target);
  }

  const roots = nodes.filter(
    (n) => (inDegree.get(n.id) ?? 0) === 0 || (n.data as DesignNodeData).defId === "client"
  );

  for (const r of roots) {
    loadMap.set(r.id, { rps: baseRps, readFrac: globalReadFrac });
  }

  const queue: string[] = roots.map((r) => r.id);
  const seen = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (seen.has(nodeId)) continue;
    seen.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    const { rps: inRps, readFrac } = loadMap.get(nodeId) ?? { rps: 0, readFrac: globalReadFrac };
    const targets = outEdges.get(nodeId) ?? [];
    if (targets.length === 0) continue;

    const outRps = computeOutRps((node.data as DesignNodeData).defId, node.data as DesignNodeData, inRps, nodeId, ctx);
    const perTarget = outRps / targets.length;

    for (const tgt of targets) {
      const existing = loadMap.get(tgt);
      loadMap.set(tgt, {
        rps: (existing?.rps ?? 0) + perTarget,
        readFrac: existing?.readFrac ?? readFrac,
      });
      queue.push(tgt);
    }
  }

  return loadMap;
}

function computeOutRps(
  defId: string,
  data: DesignNodeData,
  inRps: number,
  nodeId: string,
  ctx: EngineCtx
): number {
  const { apis, concurrentUsers, cacheHitRates } = ctx;
  const p = data.params;

  switch (defId) {
    case "redis":
    case "memcached": {
      // Split traffic into read (with hit/miss) and write (always goes downstream)
      const totalWeight = apis.reduce((s, a) => s + a.weight, 0) || 1;
      let readFrac = 0;
      let writeFrac = 0;
      let hasInteractions = false;

      for (const api of apis) {
        const frac = api.weight / totalWeight;
        if (api.cacheInteractions.some((c) => c.nodeId === nodeId && c.operation === "read")) {
          readFrac += frac;
          hasInteractions = true;
        }
        if (api.cacheInteractions.some((c) => c.nodeId === nodeId && c.operation === "write")) {
          writeFrac += frac;
          hasInteractions = true;
        }
      }

      if (!hasInteractions) {
        // No interactions: fall back to 50% pass-through
        const hitRate = cacheHitRates.get(nodeId) ?? 0.5;
        return inRps * (1 - hitRate);
      }

      const hitRate = cacheHitRates.get(nodeId) ?? 0.5;
      // Write traffic flows through to downstream DB; read misses flow through
      return inRps * (writeFrac + readFrac * (1 - hitRate));
    }

    case "cdn": {
      return inRps * 0.15;
    }

    case "apigateway": {
      const caching = p.caching === true || p.caching === "true";
      return caching ? inRps * 0.65 : inRps;
    }

    default:
      void concurrentUsers;
      return inRps;
  }
}

// ── Per-component metric computation ─────────────────────────────────────────

export interface ComputedMetrics {
  current: Record<string, number>;
  utilization: number;
  outRps: number;
}

export function computeNodeMetrics(
  node: Node<DesignNodeData>,
  load: NodeLoad,
  elapsed: number,
  nodeIndex: number,
  prevMetrics?: NodeMetrics,
  ctx?: EngineCtx
): ComputedMetrics {
  const defId = (node.data as DesignNodeData).defId;
  const params = (node.data as DesignNodeData).params;
  const phase = nodeIndex * 1.37;
  const { rps: inRps, readFrac } = load;
  const r = ramp(elapsed);
  const spike = spikeFactor(elapsed);
  const effectiveRps = inRps * r * spike;

  switch (defId) {
    case "client":
      return clientMetrics(effectiveRps, phase, elapsed);
    case "loadbalancer":
      return lbMetrics(effectiveRps, params, phase, elapsed);
    case "apigateway":
      return gatewayMetrics(effectiveRps, params, phase, elapsed);
    case "service":
      return serviceMetrics(effectiveRps, params, phase, elapsed);
    case "serverless":
      return serverlessMetrics(effectiveRps, params, phase, elapsed);
    case "postgresql":
    case "mysql":
      return sqlMetrics(effectiveRps, params, readFrac, phase, elapsed);
    case "redis":
      return redisMetrics(effectiveRps, params, phase, elapsed, node.id, ctx);
    case "memcached":
      return memcachedMetrics(effectiveRps, phase, elapsed, node.id, ctx);
    case "kafka":
      return kafkaMetrics(effectiveRps, params, phase, elapsed, prevMetrics);
    case "sqs":
      return sqsMetrics(effectiveRps, params, phase, elapsed, prevMetrics);
    case "rabbitmq":
      return rabbitmqMetrics(effectiveRps, params, phase, elapsed, prevMetrics);
    case "dynamodb":
      return dynamoMetrics(effectiveRps, params, readFrac, phase, elapsed);
    case "cassandra":
      return cassandraMetrics(effectiveRps, params, readFrac, phase, elapsed);
    case "mongodb":
      return mongoMetrics(effectiveRps, params, readFrac, phase, elapsed);
    case "elasticsearch":
      return esMetrics(effectiveRps, params, readFrac, phase, elapsed);
    case "cdn":
      return cdnMetrics(effectiveRps, params, phase, elapsed);
    case "objectstorage":
      return objectStorageMetrics(effectiveRps, params, phase, elapsed);
    case "kinesis":
      return kinesisMetrics(effectiveRps, params, phase, elapsed);
    case "eventbridge":
      return eventbridgeMetrics(effectiveRps, phase, elapsed);
    default:
      return { current: { rps: effectiveRps }, utilization: 0.3, outRps: effectiveRps };
  }
}

// ── Individual component metric functions ─────────────────────────────────────

function clientMetrics(rps: number, phase: number, elapsed: number): ComputedMetrics {
  const noised = rps * (1 + smooth(elapsed, phase, 0.08));
  return { current: { rps: round(noised) }, utilization: 0.2, outRps: noised };
}

function lbMetrics(rps: number, params: Record<string, unknown>, phase: number, elapsed: number): ComputedMetrics {
  const capacity = (params.max_throughput_rps as number) ?? 50000;
  const noised = rps * (1 + smooth(elapsed, phase, 0.06));
  const latency = 3 + smooth(elapsed, phase + 1, 2);
  const connections = noised * 0.12;
  const util = clamp(noised / capacity, 0, 1);
  const dropped = util > 0.9 ? (util - 0.9) * 20 : 0;
  void params;
  return {
    current: {
      rps: round(noised),
      active_connections: round(connections),
      latency_ms: round(Math.max(1, latency), 1),
      dropped_pct: round(dropped, 2),
    },
    utilization: util,
    outRps: noised,
  };
}

function gatewayMetrics(rps: number, params: Record<string, unknown>, phase: number, elapsed: number): ComputedMetrics {
  const rateLimit = (params.rate_limit_rps as number) ?? 10000;
  const caching = params.caching === true || params.caching === "true";
  const waf = params.waf_enabled === true || params.waf_enabled === "true";

  const noised = rps * (1 + smooth(elapsed, phase, 0.07));
  const util = clamp(noised / rateLimit, 0, 1.2);
  const latency = 10 + util * 60 + smooth(elapsed, phase + 2, 5);
  const cacheHit = caching ? clamp(35 + smooth(elapsed, phase, 8), 20, 55) : 0;
  const rateLimited = util > 1 ? clamp((util - 1) * 50, 0, 100) : 0;
  const wafBlocked = waf ? clamp(0.8 + smooth(elapsed, phase + 0.5, 0.5), 0, 5) : 0;

  return {
    current: {
      rps: round(noised),
      latency_ms: round(Math.max(5, latency), 1),
      cache_hit_pct: round(cacheHit, 1),
      rate_limited_pct: round(rateLimited, 2),
      waf_blocked_pct: round(wafBlocked, 2),
    },
    utilization: Math.min(util, 1),
    outRps: noised,
  };
}

function serviceMetrics(rps: number, params: Record<string, unknown>, phase: number, elapsed: number): ComputedMetrics {
  const instances = (params.instances as number) ?? 3;
  const capacity = instances * 500;
  const noised = rps * (1 + smooth(elapsed, phase, 0.09));
  const util = clamp(noised / capacity, 0, 1.3);

  const cpu = clamp(util * 75 + smooth(elapsed, phase, 8), 5, 100);
  const mem = clamp(30 + util * 45 + smooth(elapsed, phase + 1, 4), 20, 100);
  const latency = 15 + util * util * 180 + smooth(elapsed, phase + 2, 10);
  const errorRate = util > 0.85 ? clamp((util - 0.85) / 0.15 * 15, 0, 50) : 0;

  return {
    current: {
      rps: round(noised),
      cpu_pct: round(clamp(cpu, 0, 100), 1),
      memory_pct: round(clamp(mem, 0, 100), 1),
      latency_ms: round(Math.max(5, latency), 1),
      error_rate_pct: round(errorRate, 2),
    },
    utilization: Math.min(util, 1),
    outRps: noised,
  };
}

function serverlessMetrics(rps: number, params: Record<string, unknown>, phase: number, elapsed: number): ComputedMetrics {
  const timeoutSec = (params.timeout_sec as number) ?? 30;
  const reserved = (params.reserved_concurrency as number) ?? 0;
  const capacity = reserved > 0 ? reserved : 3000;

  const invocations = rps * (1 + smooth(elapsed, phase, 0.1));
  const util = clamp(invocations / capacity, 0, 1.2);
  const warmup = cacheWarmup(elapsed);
  const coldStartRate = clamp((1 - warmup) * invocations * 0.05, 0, invocations);
  const duration = timeoutSec * 1000 * (0.05 + util * 0.25 + smooth(elapsed, phase + 1, 0.02));
  const errorRate = util > 0.9 ? (util - 0.9) * 40 : 0;

  return {
    current: {
      invocations_per_sec: round(invocations, 1),
      cold_starts_per_sec: round(coldStartRate, 2),
      duration_ms: round(Math.max(10, duration), 0),
      error_rate_pct: round(errorRate, 2),
    },
    utilization: Math.min(util, 1),
    outRps: invocations,
  };
}

function sqlMetrics(
  rps: number,
  params: Record<string, unknown>,
  readFrac: number,
  phase: number,
  elapsed: number,
): ComputedMetrics {
  const poolSize = (params.connection_pool_size as number) ?? 100;
  const replicas = (params.read_replicas as number) ?? 0;

  // rps and readFrac are already interaction-computed in tickSimulation
  const effectiveRps = rps;
  const effectiveReadFrac = readFrac;

  const readQps = effectiveRps * effectiveReadFrac;
  const writeQps = effectiveRps * (1 - effectiveReadFrac);
  const effectiveReadCapacity = poolSize * (1 + replicas) * 5;
  const effectiveWriteCapacity = poolSize * 5;

  const readUtil = clamp(readQps / effectiveReadCapacity, 0, 1.2);
  const writeUtil = clamp(writeQps / effectiveWriteCapacity, 0, 1.2);
  const util = Math.max(readUtil, writeUtil);

  const totalQps = effectiveRps * (1 + smooth(elapsed, phase, 0.05));
  const connections = clamp(util * poolSize + smooth(elapsed, phase + 1, 5), 0, poolSize);
  const latency = 2 + util * 60 + smooth(elapsed, phase + 2, 3);
  const replLag = replicas > 0 ? clamp(util * 150 + smooth(elapsed, phase + 3, 30), 0, 5000) : 0;

  return {
    current: {
      qps: round(Math.max(0, totalQps)),
      read_qps: round(Math.max(0, readQps + smooth(elapsed, phase, readQps * 0.05))),
      write_qps: round(Math.max(0, writeQps + smooth(elapsed, phase + 1, writeQps * 0.05))),
      connections_used: round(Math.max(0, connections), 0),
      latency_ms: round(Math.max(1, latency), 1),
      replication_lag_ms: round(replLag, 0),
    },
    utilization: Math.min(util, 1),
    outRps: 0,
  };
}

function redisMetrics(
  rps: number,
  params: Record<string, unknown>,
  phase: number,
  elapsed: number,
  nodeId: string,
  ctx?: EngineCtx
): ComputedMetrics {
  const nodes = (params.nodes as number) ?? 3;
  const noised = rps * (1 + smooth(elapsed, phase, 0.06));
  const util = clamp(noised / (nodes * 100000), 0, 1);
  const latency = 0.3 + util * 3 + smooth(elapsed, phase + 1, 0.2);

  // Use precomputed hit rate from ctx; fall back to degraded default if unconfigured
  const precomputed = ctx?.cacheHitRates.get(nodeId);
  const hitRate = precomputed !== undefined
    ? precomputed + smooth(elapsed, phase + 2, 0.02)
    : clamp(0.3 + smooth(elapsed, phase + 2, 0.1), 0.2, 0.55) * cacheWarmup(elapsed);

  const memPct = clamp(hitRate * 65 + util * 20 + smooth(elapsed, phase + 3, 4), 0, 100);

  return {
    current: {
      ops_per_sec: round(noised),
      hit_rate_pct: round(clamp(hitRate * 100, 0, 99), 1),
      miss_rate_pct: round(clamp((1 - hitRate) * 100, 1, 100), 1),
      latency_ms: round(Math.max(0.1, latency), 2),
      memory_used_pct: round(memPct, 1),
    },
    utilization: util,
    outRps: noised * (1 - hitRate),
  };
}

function memcachedMetrics(
  rps: number,
  phase: number,
  elapsed: number,
  nodeId: string,
  ctx?: EngineCtx
): ComputedMetrics {
  const noised = rps * (1 + smooth(elapsed, phase, 0.06));
  const latency = 0.2 + smooth(elapsed, phase + 1, 0.15);

  const precomputed = ctx?.cacheHitRates.get(nodeId);
  const hitRate = precomputed !== undefined
    ? precomputed + smooth(elapsed, phase + 2, 0.02)
    : clamp(0.25 + smooth(elapsed, phase + 2, 0.1), 0.15, 0.5) * cacheWarmup(elapsed);

  return {
    current: {
      ops_per_sec: round(noised),
      hit_rate_pct: round(clamp(hitRate * 100, 0, 99), 1),
      miss_rate_pct: round(clamp((1 - hitRate) * 100, 1, 100), 1),
      latency_ms: round(Math.max(0.1, latency), 2),
    },
    utilization: clamp(noised / 500000, 0, 1),
    outRps: noised * (1 - hitRate),
  };
}

function kafkaMetrics(rps: number, params: Record<string, unknown>, phase: number, elapsed: number, prev?: NodeMetrics): ComputedMetrics {
  const brokers = (params.brokers as number) ?? 3;
  const partitions = (params.partitions_per_topic as number) ?? 12;
  const replication = (params.replication_factor as number) ?? 3;

  const brokerCapacity = brokers * 150000;
  const noised = rps * (1 + smooth(elapsed, phase, 0.07));
  const util = clamp(noised / brokerCapacity, 0, 1.2);

  const prevLag = prev?.current.consumer_lag ?? 0;
  const lagDelta = util > 1 ? (util - 1) * brokerCapacity : -Math.min(prevLag, brokerCapacity * 0.1);
  const lag = Math.max(0, prevLag + lagDelta + smooth(elapsed, phase + 3, 50));
  const throughput = noised * 1024 / 1e6;
  const partUtil = clamp(noised / (partitions * 10000), 0, 100);
  void replication;

  return {
    current: {
      messages_per_sec: round(noised),
      consumer_lag: round(Math.max(0, lag), 0),
      partition_util_pct: round(partUtil, 1),
      throughput_mbps: round(throughput, 2),
    },
    utilization: Math.min(util, 1),
    outRps: noised,
  };
}

function sqsMetrics(rps: number, params: Record<string, unknown>, phase: number, elapsed: number, prev?: NodeMetrics): ComputedMetrics {
  const dlq = params.enable_dlq === true || params.enable_dlq === "true";
  const noised = rps * (1 + smooth(elapsed, phase, 0.08));
  const consumeRate = noised * 0.95;
  const prevDepth = prev?.current.queue_depth ?? 0;
  const depthDelta = (noised - consumeRate) + smooth(elapsed, phase + 2, 10);
  const depth = Math.max(0, prevDepth + depthDelta);
  const dlqMsgs = dlq ? clamp(depth * 0.01 + smooth(elapsed, phase + 3, 2), 0, 1000) : 0;
  void params;

  return {
    current: {
      enqueue_rate: round(noised, 1),
      dequeue_rate: round(consumeRate, 1),
      queue_depth: round(Math.max(0, depth), 0),
      dlq_messages: round(Math.max(0, dlqMsgs), 0),
    },
    utilization: clamp(depth / 50000, 0, 1),
    outRps: noised,
  };
}

function rabbitmqMetrics(rps: number, params: Record<string, unknown>, phase: number, elapsed: number, prev?: NodeMetrics): ComputedMetrics {
  const nodes = (params.nodes as number) ?? 3;
  const capacity = nodes * 50000;
  const noised = rps * (1 + smooth(elapsed, phase, 0.07));
  const util = clamp(noised / capacity, 0, 1.2);
  const prevDepth = prev?.current.queue_depth ?? 0;
  const depthDelta = util > 1 ? (util - 1) * capacity : -Math.min(prevDepth, capacity * 0.1);
  const depth = Math.max(0, prevDepth + depthDelta + smooth(elapsed, phase + 2, 20));
  const latency = 2 + util * 40 + smooth(elapsed, phase + 1, 3);

  return {
    current: {
      publish_rate: round(noised, 1),
      consume_rate: round(noised * 0.97, 1),
      queue_depth: round(Math.max(0, depth), 0),
      latency_ms: round(Math.max(1, latency), 1),
    },
    utilization: Math.min(util, 1),
    outRps: noised,
  };
}

function dynamoMetrics(rps: number, params: Record<string, unknown>, readFrac: number, phase: number, elapsed: number): ComputedMetrics {
  const billingMode = (params.billing_mode as string) ?? "On-Demand";
  const rcu = (params.rcu as number) ?? 1000;
  const wcu = (params.wcu as number) ?? 1000;

  const noised = rps * (1 + smooth(elapsed, phase, 0.06));
  const rcuUsed = noised * readFrac * (1 + smooth(elapsed, phase + 1, 0.1));
  const wcuUsed = noised * (1 - readFrac) * (1 + smooth(elapsed, phase + 2, 0.1));

  let util = 0.3;
  let throttled = 0;
  if (billingMode === "Provisioned") {
    const rcuUtil = clamp(rcuUsed / rcu, 0, 1.5);
    const wcuUtil = clamp(wcuUsed / wcu, 0, 1.5);
    util = Math.max(rcuUtil, wcuUtil);
    throttled = util > 1 ? (util - 1) * 100 : 0;
  } else {
    util = clamp(noised / 50000, 0, 0.8);
  }

  const latency = 3 + util * 18 + smooth(elapsed, phase + 3, 1);

  return {
    current: {
      rcu_consumed: round(Math.max(0, rcuUsed), 1),
      wcu_consumed: round(Math.max(0, wcuUsed), 1),
      latency_ms: round(Math.max(1, latency), 1),
      throttled_pct: round(Math.max(0, throttled), 2),
    },
    utilization: Math.min(util, 1),
    outRps: 0,
  };
}

function cassandraMetrics(rps: number, params: Record<string, unknown>, readFrac: number, phase: number, elapsed: number): ComputedMetrics {
  const nodes = (params.nodes as number) ?? 6;
  const consistency = (params.consistency_level as string) ?? "QUORUM";
  const capacity = nodes * 20000;
  const noised = rps * (1 + smooth(elapsed, phase, 0.07));
  const util = clamp(noised / capacity, 0, 1.2);
  const consistencyMult = consistency === "ONE" ? 1 : consistency === "QUORUM" ? 1.8 : 2.5;
  const readLatency = (1 + util * 40) * consistencyMult + smooth(elapsed, phase + 1, 3);
  const writeLatency = (0.5 + util * 20) + smooth(elapsed, phase + 2, 2);
  const compaction = clamp(util * 15 + smooth(elapsed, phase + 3, 5), 0, 50);
  void readFrac;

  return {
    current: {
      ops_per_sec: round(noised),
      read_latency_ms: round(Math.max(0.5, readLatency), 1),
      write_latency_ms: round(Math.max(0.3, writeLatency), 1),
      compaction_pending: round(Math.max(0, compaction), 0),
    },
    utilization: Math.min(util, 1),
    outRps: 0,
  };
}

function mongoMetrics(rps: number, params: Record<string, unknown>, readFrac: number, phase: number, elapsed: number): ComputedMetrics {
  const shards = (params.shards as number) ?? 3;
  const replicaSetSize = (params.replica_set_size as number) ?? 3;
  const capacity = shards * 5000;
  const noised = rps * (1 + smooth(elapsed, phase, 0.07));
  const util = clamp(noised / capacity, 0, 1.2);
  const connections = clamp(util * 200 + smooth(elapsed, phase + 1, 10), 0, 500);
  const latency = 3 + util * 50 + smooth(elapsed, phase + 2, 4);
  const replLag = replicaSetSize > 1 ? clamp(util * 100 + smooth(elapsed, phase + 3, 20), 0, 3000) : 0;
  void readFrac;

  return {
    current: {
      ops_per_sec: round(noised),
      latency_ms: round(Math.max(1, latency), 1),
      connections_used: round(connections, 0),
      replication_lag_ms: round(replLag, 0),
    },
    utilization: Math.min(util, 1),
    outRps: 0,
  };
}

function esMetrics(rps: number, params: Record<string, unknown>, readFrac: number, phase: number, elapsed: number): ComputedMetrics {
  const nodes = (params.nodes as number) ?? 3;
  const capacity = nodes * 2000;
  const noised = rps * (1 + smooth(elapsed, phase, 0.08));
  const util = clamp(noised / capacity, 0, 1.2);
  const queryRate = noised * readFrac;
  const indexingRate = noised * (1 - readFrac);
  const latency = 10 + util * 120 + smooth(elapsed, phase + 1, 10);
  const heap = clamp(30 + util * 50 + smooth(elapsed, phase + 2, 5), 0, 100);
  void params;

  return {
    current: {
      query_rate: round(queryRate, 1),
      indexing_rate: round(indexingRate, 1),
      latency_ms: round(Math.max(5, latency), 1),
      heap_used_pct: round(heap, 1),
    },
    utilization: Math.min(util, 1),
    outRps: 0,
  };
}

function cdnMetrics(rps: number, params: Record<string, unknown>, phase: number, elapsed: number): ComputedMetrics {
  const warmup = cacheWarmup(elapsed);
  const targetHitRate = 0.85 + warmup * 0.08;
  const noised = rps * (1 + smooth(elapsed, phase, 0.05));
  const hitRate = clamp(targetHitRate + smooth(elapsed, phase + 1, 0.03), 0.5, 0.99);
  const originRps = noised * (1 - hitRate);
  const bandwidth = noised * 50 / 1000;
  void params;

  return {
    current: {
      rps: round(noised),
      cache_hit_rate_pct: round(hitRate * 100, 1),
      origin_rps: round(originRps, 1),
      bandwidth_mbps: round(bandwidth, 2),
    },
    utilization: 0.2,
    outRps: originRps,
  };
}

function objectStorageMetrics(rps: number, params: Record<string, unknown>, phase: number, elapsed: number): ComputedMetrics {
  const noised = rps * (1 + smooth(elapsed, phase, 0.06));
  const bandwidth = noised * 200 / 1000;
  const storageGb = 100 + elapsed * noised * 0.0001;
  void params;

  return {
    current: {
      ops_per_sec: round(noised, 1),
      bandwidth_mbps: round(bandwidth, 2),
      storage_gb: round(storageGb, 1),
    },
    utilization: 0.1,
    outRps: 0,
  };
}

function kinesisMetrics(rps: number, params: Record<string, unknown>, phase: number, elapsed: number): ComputedMetrics {
  const shards = (params.shards as number) ?? 4;
  const shardCapacity = shards * 1000;
  const noised = rps * (1 + smooth(elapsed, phase, 0.07));
  const shardUtil = clamp(noised / shardCapacity * 100, 0, 120);
  const iteratorAge = shardUtil > 80
    ? (shardUtil - 80) * 2000 + smooth(elapsed, phase + 1, 5000)
    : smooth(elapsed, phase + 1, 200);

  return {
    current: {
      records_per_sec: round(noised),
      shard_util_pct: round(Math.min(shardUtil, 100), 1),
      iterator_age_ms: round(Math.max(0, iteratorAge), 0),
    },
    utilization: Math.min(shardUtil / 100, 1),
    outRps: noised,
  };
}

function eventbridgeMetrics(rps: number, phase: number, elapsed: number): ComputedMetrics {
  const noised = rps * (1 + smooth(elapsed, phase, 0.07));
  const matched = clamp(65 + smooth(elapsed, phase + 1, 15), 30, 100);
  const failed = clamp(0.1 + smooth(elapsed, phase + 2, 0.1), 0, 5);

  return {
    current: {
      events_per_sec: round(noised),
      matched_pct: round(matched, 1),
      failed_pct: round(failed, 2),
    },
    utilization: 0.2,
    outRps: noised,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function round(v: number, decimals = 0): number {
  const factor = Math.pow(10, decimals);
  return Math.round(v * factor) / factor;
}

// ── Full tick ──────────────────────────────────────────────────────────────────

const MAX_SERIES_POINTS = 60;

export interface TickResult {
  nodeMetrics: Record<string, NodeMetrics>;
  apiBreakdown: ApiBreakdown[];
}

export function tickSimulation(
  nodes: Node<DesignNodeData>[],
  edges: Edge[],
  apis: ApiDef[],
  concurrentUsers: number,
  elapsed: number,
  prevMetrics: Record<string, NodeMetrics>
): TickResult {
  if (nodes.length === 0) return { nodeMetrics: {}, apiBreakdown: [] };

  // Precompute cache hit rates for all cache nodes so DB interactions can use them
  const cacheHitRates = new Map<string, number>();
  for (const node of nodes) {
    const defId = (node.data as DesignNodeData).defId;
    if (defId === "redis" || defId === "memcached") {
      const rate = apiCacheHitRate(node.id, apis, concurrentUsers, elapsed);
      if (rate !== null) cacheHitRates.set(node.id, rate);
    }
  }

  const ctx: EngineCtx = { apis, concurrentUsers, elapsed, cacheHitRates };
  const loadMap = propagateLoad(nodes, edges, ctx);

  // Override DB and cache node loads with interaction-based computation.
  // This means: no API interactions → 0 load on the node (graph edges alone
  // don't drive DB/cache metrics; only explicitly configured interactions do).
  for (const node of nodes) {
    const defId = (node.data as DesignNodeData).defId;
    if (DB_COMPONENT_IDS.has(defId)) {
      loadMap.set(node.id, computeDbInteractionLoad(node.id, ctx));
    } else if (CACHE_COMPONENT_IDS.has(defId)) {
      loadMap.set(node.id, computeCacheInteractionLoad(node.id, ctx));
    }
  }

  const nodeMetrics: Record<string, NodeMetrics> = {};

  nodes.forEach((node, idx) => {
    const defId = (node.data as DesignNodeData).defId;
    const load = loadMap.get(node.id) ?? { rps: 0, readFrac: 0.5 };
    const prev = prevMetrics[node.id];

    const { current, utilization } = computeNodeMetrics(node, load, elapsed, idx, prev, ctx);
    const specs = COMPONENT_SPECS[defId] ?? [{ key: "rps", label: "RPS", unit: "req/s" }];
    const primaryKey = specs[0]?.key ?? "rps";

    const series: Record<string, MetricPoint[]> = { ...(prev?.series ?? {}) };
    for (const key of Object.keys(current)) {
      const prevSeries = series[key] ?? [];
      series[key] = [...prevSeries, { t: elapsed, v: current[key] }].slice(-MAX_SERIES_POINTS);
    }

    nodeMetrics[node.id] = { nodeId: node.id, utilization, series, current, primaryKey, specs };
  });

  // Per-API RPS breakdown
  const totalWeight = apis.reduce((s, a) => s + a.weight, 0) || 1;
  const spike = spikeFactor(elapsed);
  const r = ramp(elapsed);
  const apiBreakdown: ApiBreakdown[] = apis.map((api) => {
    const rps = Math.round(concurrentUsers * (api.weight / totalWeight) * spike * r);
    return { apiId: api.id, rps, pct: Math.round((api.weight / totalWeight) * 100) };
  });

  return { nodeMetrics, apiBreakdown };
}

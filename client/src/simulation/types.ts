export interface CacheInteraction {
  id: string;
  operation: "read" | "write";
  nodeId: string;               // Redis/Memcached node ID on the canvas
  keyPattern: string;           // e.g. "feed:{userId}" — for documentation only
  ttlSeconds: number;           // for writes: key TTL; for standalone reads: expected data TTL
  fanoutFactor: number;         // for writes: keys written per request (1 = no fanout, 500 = fan-out to followers)
  uniqueKeys: number;           // estimated total distinct keys in this namespace (affects coverage math)
  populatedBy?: string;         // for reads: id of a write CacheInteraction from any API
  targetHitRatePct: number;     // for standalone reads (no populatedBy): expected steady-state hit rate 0–99
}

export interface DbInteraction {
  id: string;
  nodeId: string;               // DB node ID on the canvas
  queriesPerRequest: number;    // DB queries per API request (1–20)
  readFraction: number;         // 0–1: fraction that are reads vs writes
  cacheFallthrough: boolean;    // if true, only queries DB on cache miss
  cacheInteractionId?: string;  // which CacheInteraction's miss drives this DB query
}

export interface ApiDef {
  id: string;
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  weight: number;               // relative request frequency (1–100)
  cacheInteractions: CacheInteraction[];
  dbInteractions: DbInteraction[];
}

export interface MetricPoint {
  t: number; // elapsed seconds
  v: number;
}

export interface MetricSpec {
  key: string;
  label: string;
  unit: string;
  decimals?: number;
  warnAbove?: number;
  goodBelow?: number;
}

export interface NodeMetrics {
  nodeId: string;
  utilization: number;      // 0–1 drives ring color
  series: Record<string, MetricPoint[]>; // up to 60 data points
  current: Record<string, number>;
  primaryKey: string;       // key to show in sparkline
  specs: MetricSpec[];      // ordered list of metrics to display
}

// Per-API RPS breakdown (global, across the whole system)
export interface ApiBreakdown {
  apiId: string;
  rps: number;
  pct: number; // percentage of total traffic
}

export type SimStatus = "idle" | "running" | "paused";

// Per-component metric specs (displayed in hover panel)
export const COMPONENT_SPECS: Record<string, MetricSpec[]> = {
  client: [
    { key: "rps", label: "Outgoing RPS", unit: "req/s" },
  ],
  loadbalancer: [
    { key: "rps", label: "Throughput", unit: "req/s" },
    { key: "active_connections", label: "Active Connections", unit: "" },
    { key: "latency_ms", label: "Avg Latency", unit: "ms", warnAbove: 100 },
    { key: "dropped_pct", label: "Dropped", unit: "%", warnAbove: 1 },
  ],
  apigateway: [
    { key: "rps", label: "RPS", unit: "req/s" },
    { key: "latency_ms", label: "Latency", unit: "ms", warnAbove: 200 },
    { key: "cache_hit_pct", label: "Cache Hit", unit: "%", goodBelow: 0 },
    { key: "rate_limited_pct", label: "Rate Limited", unit: "%", warnAbove: 5 },
    { key: "waf_blocked_pct", label: "WAF Blocked", unit: "%", warnAbove: 5 },
  ],
  service: [
    { key: "rps", label: "RPS", unit: "req/s" },
    { key: "cpu_pct", label: "CPU", unit: "%", warnAbove: 80 },
    { key: "memory_pct", label: "Memory", unit: "%", warnAbove: 85 },
    { key: "latency_ms", label: "Latency", unit: "ms", warnAbove: 200 },
    { key: "error_rate_pct", label: "Error Rate", unit: "%", warnAbove: 1 },
  ],
  serverless: [
    { key: "invocations_per_sec", label: "Invocations/s", unit: "/s" },
    { key: "cold_starts_per_sec", label: "Cold Starts/s", unit: "/s", warnAbove: 5 },
    { key: "duration_ms", label: "Avg Duration", unit: "ms", warnAbove: 1000 },
    { key: "error_rate_pct", label: "Error Rate", unit: "%", warnAbove: 1 },
  ],
  postgresql: [
    { key: "qps", label: "Queries/s", unit: "q/s" },
    { key: "read_qps", label: "Read QPS", unit: "q/s" },
    { key: "write_qps", label: "Write QPS", unit: "q/s" },
    { key: "connections_used", label: "Connections", unit: "" },
    { key: "latency_ms", label: "Query Latency", unit: "ms", warnAbove: 50 },
    { key: "replication_lag_ms", label: "Repl. Lag", unit: "ms", warnAbove: 500 },
  ],
  mysql: [
    { key: "qps", label: "Queries/s", unit: "q/s" },
    { key: "read_qps", label: "Read QPS", unit: "q/s" },
    { key: "write_qps", label: "Write QPS", unit: "q/s" },
    { key: "connections_used", label: "Connections", unit: "" },
    { key: "latency_ms", label: "Query Latency", unit: "ms", warnAbove: 50 },
    { key: "replication_lag_ms", label: "Repl. Lag", unit: "ms", warnAbove: 500 },
  ],
  redis: [
    { key: "ops_per_sec", label: "Ops/s", unit: "ops/s" },
    { key: "hit_rate_pct", label: "Hit Rate", unit: "%", goodBelow: 0 },
    { key: "miss_rate_pct", label: "Miss Rate", unit: "%", warnAbove: 30 },
    { key: "latency_ms", label: "Latency", unit: "ms", warnAbove: 5 },
    { key: "memory_used_pct", label: "Memory Used", unit: "%", warnAbove: 85 },
  ],
  memcached: [
    { key: "ops_per_sec", label: "Ops/s", unit: "ops/s" },
    { key: "hit_rate_pct", label: "Hit Rate", unit: "%", goodBelow: 0 },
    { key: "miss_rate_pct", label: "Miss Rate", unit: "%", warnAbove: 30 },
    { key: "latency_ms", label: "Latency", unit: "ms", warnAbove: 5 },
  ],
  kafka: [
    { key: "messages_per_sec", label: "Messages/s", unit: "msg/s" },
    { key: "consumer_lag", label: "Consumer Lag", unit: "msgs", warnAbove: 10000 },
    { key: "partition_util_pct", label: "Partition Util.", unit: "%", warnAbove: 80 },
    { key: "throughput_mbps", label: "Throughput", unit: "MB/s" },
  ],
  sqs: [
    { key: "enqueue_rate", label: "Enqueue/s", unit: "msg/s" },
    { key: "dequeue_rate", label: "Dequeue/s", unit: "msg/s" },
    { key: "queue_depth", label: "Queue Depth", unit: "msgs", warnAbove: 5000 },
    { key: "dlq_messages", label: "DLQ Messages", unit: "msgs", warnAbove: 0 },
  ],
  rabbitmq: [
    { key: "publish_rate", label: "Publish/s", unit: "msg/s" },
    { key: "consume_rate", label: "Consume/s", unit: "msg/s" },
    { key: "queue_depth", label: "Queue Depth", unit: "msgs", warnAbove: 5000 },
    { key: "latency_ms", label: "Latency", unit: "ms", warnAbove: 50 },
  ],
  dynamodb: [
    { key: "rcu_consumed", label: "RCU Consumed", unit: "RCU/s" },
    { key: "wcu_consumed", label: "WCU Consumed", unit: "WCU/s" },
    { key: "latency_ms", label: "Latency", unit: "ms", warnAbove: 20 },
    { key: "throttled_pct", label: "Throttled", unit: "%", warnAbove: 1 },
  ],
  cassandra: [
    { key: "ops_per_sec", label: "Ops/s", unit: "ops/s" },
    { key: "read_latency_ms", label: "Read Latency", unit: "ms", warnAbove: 50 },
    { key: "write_latency_ms", label: "Write Latency", unit: "ms", warnAbove: 20 },
    { key: "compaction_pending", label: "Compaction Pending", unit: "tasks", warnAbove: 20 },
  ],
  mongodb: [
    { key: "ops_per_sec", label: "Ops/s", unit: "ops/s" },
    { key: "latency_ms", label: "Latency", unit: "ms", warnAbove: 50 },
    { key: "connections_used", label: "Connections", unit: "" },
    { key: "replication_lag_ms", label: "Repl. Lag", unit: "ms", warnAbove: 500 },
  ],
  elasticsearch: [
    { key: "query_rate", label: "Query/s", unit: "q/s" },
    { key: "indexing_rate", label: "Indexing/s", unit: "docs/s" },
    { key: "latency_ms", label: "Search Latency", unit: "ms", warnAbove: 100 },
    { key: "heap_used_pct", label: "JVM Heap", unit: "%", warnAbove: 75 },
  ],
  cdn: [
    { key: "rps", label: "Requests/s", unit: "req/s" },
    { key: "cache_hit_rate_pct", label: "Cache Hit Rate", unit: "%", goodBelow: 0 },
    { key: "origin_rps", label: "Origin RPS", unit: "req/s" },
    { key: "bandwidth_mbps", label: "Bandwidth", unit: "MB/s" },
  ],
  objectstorage: [
    { key: "ops_per_sec", label: "Ops/s", unit: "ops/s" },
    { key: "bandwidth_mbps", label: "Bandwidth", unit: "MB/s" },
    { key: "storage_gb", label: "Data Stored", unit: "GB" },
  ],
  kinesis: [
    { key: "records_per_sec", label: "Records/s", unit: "rec/s" },
    { key: "shard_util_pct", label: "Shard Util.", unit: "%", warnAbove: 80 },
    { key: "iterator_age_ms", label: "Iterator Age", unit: "ms", warnAbove: 60000 },
  ],
  eventbridge: [
    { key: "events_per_sec", label: "Events/s", unit: "ev/s" },
    { key: "matched_pct", label: "Matched Rules", unit: "%" },
    { key: "failed_pct", label: "Failed", unit: "%", warnAbove: 1 },
  ],
};

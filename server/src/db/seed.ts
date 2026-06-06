import "dotenv/config";
import { db } from "./index.js";
import { components } from "./schema.js";
import type { Param } from "./schema.js";
import { sql } from "drizzle-orm";

type ComponentSeed = {
  id: string;
  category: string;
  label: string;
  color: string;
  icon: string;
  description: string;
  params: Param[];
  cardSummary: string[];
  acceptsFrom: string[];
};

const componentData: ComponentSeed[] = [
  // ─── QUEUES ────────────────────────────────────────────────────────────────
  {
    id: "kafka",
    category: "Queues",
    label: "Kafka",
    color: "amber",
    icon: "Layers",
    description: "Distributed event streaming platform for high-throughput pipelines",
    params: [
      { key: "brokers", label: "Brokers", type: "int", range: [1, 20], default: 3 },
      { key: "partitions_per_topic", label: "Partitions per Topic", type: "int", range: [1, 512], default: 12 },
      { key: "replication_factor", label: "Replication Factor", type: "int", range: [1, 5], default: 3 },
      { key: "retention_hours", label: "Retention (hours)", type: "int", range: [1, 2160], default: 168 },
      { key: "consumer_groups", label: "Consumer Groups", type: "text[]", default: [] },
      { key: "topics", label: "Topics", type: "text[]", required: true, default: [], hint: "Add at least one topic" },
    ],
    cardSummary: ["brokers", "partitions_per_topic", "replication_factor"],
    acceptsFrom: ["service", "serverless", "apigateway"],
  },
  {
    id: "sqs",
    category: "Queues",
    label: "SQS",
    color: "amber",
    icon: "MessageSquare",
    description: "Fully managed message queuing service by AWS",
    params: [
      { key: "queue_type", label: "Queue Type", type: "enum", options: ["Standard", "FIFO"], default: "Standard" },
      { key: "visibility_timeout_sec", label: "Visibility Timeout (sec)", type: "int", range: [1, 43200], default: 30 },
      { key: "retention_days", label: "Retention (days)", type: "int", range: [1, 14], default: 4 },
      { key: "enable_dlq", label: "Enable DLQ", type: "bool", default: false },
      { key: "dlq_max_receives", label: "DLQ Max Receives", type: "int", range: [1, 1000], default: 3, showWhen: { key: "enable_dlq", value: true } },
    ],
    cardSummary: ["queue_type", "retention_days", "enable_dlq"],
    acceptsFrom: ["service", "serverless", "apigateway"],
  },
  {
    id: "rabbitmq",
    category: "Queues",
    label: "RabbitMQ",
    color: "amber",
    icon: "GitMerge",
    description: "Open-source message broker with flexible routing via exchanges",
    params: [
      { key: "nodes", label: "Nodes", type: "int", range: [1, 10], default: 3 },
      { key: "exchanges", label: "Exchanges", type: "text[]", default: [] },
      { key: "prefetch_count", label: "Prefetch Count", type: "int", range: [1, 1000], default: 100 },
      { key: "vhosts", label: "Virtual Hosts", type: "int", range: [1, 50], default: 1 },
    ],
    cardSummary: ["nodes", "exchanges", "prefetch_count"],
    acceptsFrom: ["service"],
  },

  // ─── DATABASES — Relational ────────────────────────────────────────────────
  {
    id: "postgresql",
    category: "Databases",
    label: "PostgreSQL",
    color: "blue",
    icon: "Database",
    description: "Advanced open-source relational database with strong ACID compliance",
    params: [
      { key: "read_replicas", label: "Read Replicas", type: "int", range: [0, 10], default: 2 },
      { key: "sharding", label: "Sharding", type: "enum", options: ["None", "Range", "Hash", "Consistent Hashing"], default: "None" },
      { key: "connection_pool_size", label: "Connection Pool Size", type: "int", range: [10, 1000], default: 100 },
      { key: "indexes", label: "Indexes", type: "text[]", default: [] },
      { key: "extensions", label: "Extensions", type: "text[]", default: [] },
      { key: "table_schema", label: "Table Schema (DDL)", type: "textarea", required: true, default: "", hint: "SQL DDL for your tables" },
    ],
    cardSummary: ["read_replicas", "sharding", "connection_pool_size"],
    acceptsFrom: ["service", "apigateway"],
  },
  {
    id: "mysql",
    category: "Databases",
    label: "MySQL",
    color: "blue",
    icon: "Database",
    description: "Popular open-source relational database widely used in web applications",
    params: [
      { key: "read_replicas", label: "Read Replicas", type: "int", range: [0, 10], default: 2 },
      { key: "sharding", label: "Sharding", type: "enum", options: ["None", "Range", "Hash", "Consistent Hashing"], default: "None" },
      { key: "connection_pool_size", label: "Connection Pool Size", type: "int", range: [10, 1000], default: 100 },
      { key: "indexes", label: "Indexes", type: "text[]", default: [] },
      { key: "extensions", label: "Extensions", type: "text[]", default: [] },
      { key: "table_schema", label: "Table Schema (DDL)", type: "textarea", required: true, default: "", hint: "SQL DDL for your tables" },
    ],
    cardSummary: ["read_replicas", "sharding", "connection_pool_size"],
    acceptsFrom: ["service", "apigateway"],
  },

  // ─── DATABASES — NoSQL Wide Column ─────────────────────────────────────────
  {
    id: "cassandra",
    category: "Databases",
    label: "Cassandra",
    color: "blue",
    icon: "Server",
    description: "Distributed wide-column store optimized for write-heavy workloads",
    params: [
      { key: "nodes", label: "Nodes", type: "int", range: [3, 100], default: 6 },
      { key: "replication_factor", label: "Replication Factor", type: "int", range: [1, 5], default: 3 },
      { key: "consistency_level", label: "Consistency Level", type: "enum", options: ["ONE", "QUORUM", "LOCAL_QUORUM", "ALL"], default: "QUORUM" },
      { key: "compaction", label: "Compaction", type: "enum", options: ["STCS", "LCS", "TWCS"], default: "STCS" },
      { key: "partition_key", label: "Partition Key", type: "text", required: true, default: "", hint: "Primary partition key column" },
      { key: "clustering_columns", label: "Clustering Columns", type: "text[]", default: [] },
    ],
    cardSummary: ["nodes", "replication_factor", "consistency_level"],
    acceptsFrom: ["service"],
  },
  {
    id: "dynamodb",
    category: "Databases",
    label: "DynamoDB",
    color: "blue",
    icon: "Zap",
    description: "Serverless key-value and document database by AWS with single-digit millisecond latency",
    params: [
      { key: "billing_mode", label: "Billing Mode", type: "enum", options: ["On-Demand", "Provisioned"], default: "On-Demand" },
      { key: "rcu", label: "Read Capacity Units", type: "int", range: [1, 40000], default: 1000, showWhen: { key: "billing_mode", value: "Provisioned" } },
      { key: "wcu", label: "Write Capacity Units", type: "int", range: [1, 40000], default: 1000, showWhen: { key: "billing_mode", value: "Provisioned" } },
      { key: "global_secondary_indexes", label: "Global Secondary Indexes", type: "text[]", default: [] },
      { key: "local_secondary_indexes", label: "Local Secondary Indexes", type: "text[]", default: [] },
      { key: "partition_key", label: "Partition Key", type: "text", required: true, default: "" },
      { key: "sort_key", label: "Sort Key", type: "text", default: "", hint: "Leave blank if not needed" },
      { key: "table_schema", label: "Table Schema (JSON)", type: "textarea", required: true, default: "", hint: "JSON schema for your table" },
    ],
    cardSummary: ["billing_mode", "partition_key", "global_secondary_indexes"],
    acceptsFrom: ["service", "serverless", "apigateway"],
  },

  // ─── DATABASES — NoSQL Document ────────────────────────────────────────────
  {
    id: "mongodb",
    category: "Databases",
    label: "MongoDB",
    color: "blue",
    icon: "Leaf",
    description: "Document-oriented database with flexible schema and horizontal scaling",
    params: [
      { key: "shards", label: "Shards", type: "int", range: [1, 50], default: 3 },
      { key: "replica_set_size", label: "Replica Set Size", type: "int", range: [1, 7], default: 3 },
      { key: "sharding_key", label: "Sharding Key", type: "text", default: "" },
      { key: "collection_schema", label: "Collection Schema (JSON Schema)", type: "textarea", required: true, default: "", hint: "JSON Schema for your collection" },
    ],
    cardSummary: ["shards", "replica_set_size", "sharding_key"],
    acceptsFrom: ["service"],
  },

  // ─── CACHE ─────────────────────────────────────────────────────────────────
  {
    id: "redis",
    category: "Cache",
    label: "Redis",
    color: "cyan",
    icon: "Cpu",
    description: "In-memory data structure store used as cache, message broker, and database",
    params: [
      { key: "nodes", label: "Nodes", type: "int", range: [1, 100], default: 3 },
      { key: "mode", label: "Mode", type: "enum", options: ["Standalone", "Cluster", "Sentinel"], default: "Cluster" },
      { key: "eviction_policy", label: "Eviction Policy", type: "enum", options: ["LRU", "LFU", "TTL", "No-Eviction"], default: "LRU" },
      { key: "max_memory_gb", label: "Max Memory (GB)", type: "int", range: [1, 512], default: 16 },
      { key: "persistence", label: "Persistence", type: "enum", options: ["None", "RDB", "AOF", "RDB+AOF"], default: "RDB" },
    ],
    cardSummary: ["nodes", "mode", "eviction_policy"],
    acceptsFrom: ["service", "apigateway"],
  },
  {
    id: "memcached",
    category: "Cache",
    label: "Memcached",
    color: "cyan",
    icon: "MemoryStick",
    description: "Simple, high-performance distributed memory caching system",
    params: [
      { key: "nodes", label: "Nodes", type: "int", range: [1, 50], default: 3 },
      { key: "memory_per_node_gb", label: "Memory per Node (GB)", type: "int", range: [1, 64], default: 8 },
    ],
    cardSummary: ["nodes", "memory_per_node_gb"],
    acceptsFrom: ["service"],
  },

  // ─── SEARCH ────────────────────────────────────────────────────────────────
  {
    id: "elasticsearch",
    category: "Search",
    label: "Elasticsearch",
    color: "emerald",
    icon: "Search",
    description: "Distributed search and analytics engine built on Apache Lucene",
    params: [
      { key: "nodes", label: "Nodes", type: "int", range: [1, 50], default: 3 },
      { key: "shards_per_index", label: "Shards per Index", type: "int", range: [1, 50], default: 5 },
      { key: "replicas_per_shard", label: "Replicas per Shard", type: "int", range: [0, 5], default: 1 },
      { key: "index_mapping", label: "Index Mapping (JSON)", type: "textarea", required: true, default: "", hint: "Elasticsearch index mapping JSON" },
    ],
    cardSummary: ["nodes", "shards_per_index", "replicas_per_shard"],
    acceptsFrom: ["service"],
  },

  // ─── COMPUTE ───────────────────────────────────────────────────────────────
  {
    id: "service",
    category: "Compute",
    label: "Service / Microservice",
    color: "violet",
    icon: "Box",
    description: "Backend microservice owning a bounded domain with its own deployment lifecycle",
    params: [
      { key: "instances", label: "Instances", type: "int", range: [1, 1000], default: 3 },
      { key: "cpu_cores", label: "CPU Cores", type: "int", range: [1, 64], default: 2 },
      { key: "memory_gb", label: "Memory (GB)", type: "int", range: [1, 256], default: 4 },
      { key: "language", label: "Language", type: "enum", options: ["Java", "Go", "Python", "Node.js", "Rust", "C++"], default: "Go" },
      { key: "autoscaling", label: "Autoscaling", type: "bool", default: true },
      { key: "responsibilities", label: "Responsibilities", type: "textarea", required: true, default: "", hint: "What does this service own and do?" },
    ],
    cardSummary: ["instances", "language", "autoscaling"],
    acceptsFrom: ["loadbalancer", "apigateway", "kafka", "sqs", "rabbitmq", "kinesis"],
  },
  {
    id: "serverless",
    category: "Compute",
    label: "Serverless Function",
    color: "violet",
    icon: "Sparkles",
    description: "Event-driven function-as-a-service that scales to zero automatically",
    params: [
      { key: "runtime", label: "Runtime", type: "enum", options: ["Node.js", "Python", "Go", "Java", "Ruby"], default: "Node.js" },
      { key: "memory_mb", label: "Memory (MB)", type: "int", range: [128, 10240], default: 512 },
      { key: "timeout_sec", label: "Timeout (sec)", type: "int", range: [1, 900], default: 30 },
      { key: "reserved_concurrency", label: "Reserved Concurrency", type: "int", range: [0, 3000], default: 0, hint: "0 = unreserved" },
      { key: "trigger_type", label: "Trigger Type", type: "enum", options: ["HTTP", "Queue", "Schedule", "Event", "Stream"], required: true, default: "HTTP" },
      { key: "function_description", label: "Function Description", type: "textarea", required: true, default: "", hint: "What does this function do?" },
    ],
    cardSummary: ["runtime", "memory_mb", "trigger_type"],
    acceptsFrom: ["apigateway", "sqs", "kinesis", "eventbridge"],
  },

  // ─── INFRASTRUCTURE ────────────────────────────────────────────────────────
  {
    id: "loadbalancer",
    category: "Infrastructure",
    label: "Load Balancer",
    color: "slate",
    icon: "GitBranch",
    description: "Distributes incoming traffic across multiple backend instances",
    params: [
      { key: "type", label: "Type", type: "enum", options: ["ALB (L7)", "NLB (L4)", "Classic"], default: "ALB (L7)" },
      { key: "max_throughput_rps", label: "Max Throughput (RPS)", type: "int", range: [1000, 1000000], default: 50000 },
      { key: "algorithm", label: "Algorithm", type: "enum", options: ["Round Robin", "Least Connections", "IP Hash", "Weighted"], default: "Round Robin" },
      { key: "health_check_interval_sec", label: "Health Check Interval (sec)", type: "int", range: [5, 300], default: 30 },
      { key: "ssl_termination", label: "SSL Termination", type: "bool", default: true },
      { key: "sticky_sessions", label: "Sticky Sessions", type: "bool", default: false },
    ],
    cardSummary: ["type", "max_throughput_rps", "algorithm"],
    acceptsFrom: ["client"],
  },
  {
    id: "apigateway",
    category: "Infrastructure",
    label: "API Gateway",
    color: "slate",
    icon: "Globe",
    description: "Managed API front door with rate limiting, auth, and routing",
    params: [
      { key: "rate_limit_rps", label: "Rate Limit (RPS)", type: "int", range: [1, 1000000], default: 10000 },
      { key: "auth", label: "Auth", type: "enum", options: ["None", "JWT", "OAuth2", "API Key", "mTLS"], default: "JWT" },
      { key: "caching", label: "Caching", type: "bool", default: false },
      { key: "cache_ttl_sec", label: "Cache TTL (sec)", type: "int", range: [1, 3600], default: 300, showWhen: { key: "caching", value: true } },
      { key: "waf_enabled", label: "WAF Enabled", type: "bool", default: false },
    ],
    cardSummary: ["rate_limit_rps", "auth", "waf_enabled"],
    acceptsFrom: ["loadbalancer", "client"],
  },
  {
    id: "cdn",
    category: "Infrastructure",
    label: "CDN",
    color: "slate",
    icon: "Wifi",
    description: "Content delivery network that caches static assets at edge locations globally",
    params: [
      { key: "provider", label: "Provider", type: "enum", options: ["CloudFront", "Cloudflare", "Fastly", "Akamai"], default: "CloudFront" },
      { key: "cache_ttl_sec", label: "Cache TTL (sec)", type: "int", range: [60, 86400], default: 3600 },
      { key: "origin_shield", label: "Origin Shield", type: "bool", default: false },
      { key: "geo_restriction", label: "Geo Restriction", type: "text[]", default: [] },
    ],
    cardSummary: ["provider", "cache_ttl_sec", "origin_shield"],
    acceptsFrom: ["client"],
  },
  {
    id: "objectstorage",
    category: "Infrastructure",
    label: "Object Storage",
    color: "slate",
    icon: "HardDrive",
    description: "Scalable blob storage for files, media, backups, and static assets",
    params: [
      { key: "provider", label: "Provider", type: "enum", options: ["S3", "GCS", "Azure Blob"], default: "S3" },
      { key: "versioning", label: "Versioning", type: "bool", default: false },
      { key: "replication", label: "Replication", type: "enum", options: ["None", "Same-Region", "Cross-Region"], default: "None" },
      { key: "access_control", label: "Access Control", type: "enum", options: ["Private", "Public-Read", "Bucket-Policy"], default: "Private" },
      { key: "lifecycle_rules", label: "Lifecycle Rules", type: "text[]", default: [] },
    ],
    cardSummary: ["provider", "replication", "versioning"],
    acceptsFrom: ["service", "serverless", "cdn"],
  },

  // ─── STREAMING ─────────────────────────────────────────────────────────────
  {
    id: "kinesis",
    category: "Streaming",
    label: "Kinesis",
    color: "orange",
    icon: "Activity",
    description: "AWS managed real-time data streaming service for large-scale event ingestion",
    params: [
      { key: "shards", label: "Shards", type: "int", range: [1, 500], default: 4 },
      { key: "retention_hours", label: "Retention (hours)", type: "int", range: [24, 8760], default: 24 },
      { key: "enhanced_fanout", label: "Enhanced Fan-out", type: "bool", default: false },
    ],
    cardSummary: ["shards", "retention_hours", "enhanced_fanout"],
    acceptsFrom: ["service", "serverless"],
  },
  {
    id: "eventbridge",
    category: "Streaming",
    label: "EventBridge",
    color: "orange",
    icon: "Radio",
    description: "Serverless event bus for routing events between AWS services and SaaS apps",
    params: [
      { key: "event_bus", label: "Event Bus", type: "text", default: "default" },
      { key: "rules", label: "Rules", type: "text[]", default: [] },
    ],
    cardSummary: ["event_bus", "rules"],
    acceptsFrom: ["service", "serverless"],
  },

  // ─── SPECIAL: Client (always available as edge source) ─────────────────────
  {
    id: "client",
    category: "Infrastructure",
    label: "Client",
    color: "slate",
    icon: "Monitor",
    description: "End user client (browser, mobile app, or external API consumer)",
    params: [
      { key: "client_type", label: "Client Type", type: "enum", options: ["Browser", "Mobile App", "External API", "IoT Device"], default: "Browser" },
    ],
    cardSummary: ["client_type"],
    acceptsFrom: [],
  },
];

async function seed() {
  const count = await db
    .select({ id: components.id })
    .from(components)
    .limit(1);

  if (count.length > 0) {
    console.log("Components already seeded, skipping.");
    process.exit(0);
  }

  console.log(`Seeding ${componentData.length} components...`);
  await db.insert(components).values(componentData);
  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

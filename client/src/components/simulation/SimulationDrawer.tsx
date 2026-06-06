import { useState } from "react";
import {
  Play, Pause, Square, Plus, Trash2, ChevronUp, ChevronDown,
  Activity, Users, Database, ArrowUpDown, Link2, Zap,
} from "lucide-react";
import { useSimulationStore } from "@/store/simulationStore";
import { useDesignStore } from "@/store/designStore";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import type { ApiDef, CacheInteraction, DbInteraction } from "@/simulation/types";
import type { Node, Edge } from "@xyflow/react";
import type { ComponentDef, DesignNodeData } from "@/lib/types";

const METHOD_COLORS: Record<string, string> = {
  GET: "text-green-600 bg-green-50 border-green-200",
  POST: "text-blue-600 bg-blue-50 border-blue-200",
  PUT: "text-amber-600 bg-amber-50 border-amber-200",
  DELETE: "text-red-600 bg-red-50 border-red-200",
};

const DB_DEF_IDS = new Set(["postgresql", "mysql", "cassandra", "dynamodb", "mongodb", "elasticsearch"]);
const CACHE_DEF_IDS = new Set(["redis", "memcached"]);

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatUsers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return String(n);
}

function formatTTL(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${Math.round(s / 3600)}h`;
}

type Props = { open: boolean; onToggle: () => void };

export function SimulationDrawer({ open, onToggle }: Props) {
  const sim = useSimulationStore();
  const { nodes, edges, componentDefs } = useDesignStore();
  const [expandedApiId, setExpandedApiId] = useState<string | null>(null);

  const allNodes = nodes as Node<DesignNodeData>[];
  const cacheNodes = allNodes.filter((n) => CACHE_DEF_IDS.has(n.data.defId));
  const dbNodes = allNodes.filter((n) => DB_DEF_IDS.has(n.data.defId));

  const handleStart = () => sim.start(nodes as Node<DesignNodeData>[], edges);
  const handlePause = () =>
    sim.status === "paused"
      ? sim.resume(nodes as Node<DesignNodeData>[], edges)
      : sim.pause();
  const handleStop = () => sim.stop();

  const totalWeight = sim.apis.reduce((s, a) => s + a.weight, 0) || 1;
  const avgUtil =
    Object.values(sim.metrics).length > 0
      ? Object.values(sim.metrics).reduce((s, m) => s + m.utilization, 0) /
        Object.values(sim.metrics).length
      : 0;
  const statusColor =
    avgUtil < 0.6 ? "bg-green-500" : avgUtil < 0.85 ? "bg-amber-500" : "bg-red-500";

  const totalInteractions = sim.apis.reduce(
    (s, a) => s + a.cacheInteractions.length + a.dbInteractions.length,
    0
  );

  return (
    <div
      className="shrink-0 border-t border-gray-200 bg-white overflow-hidden transition-all duration-300"
      style={{ height: open ? 380 : 44 }}
    >
      {/* Collapsed header */}
      <button
        onClick={onToggle}
        className="w-full h-11 flex items-center px-4 gap-3 hover:bg-gray-50 transition-colors"
      >
        <Activity size={14} className="text-violet-500 shrink-0" />
        <span className="text-sm font-semibold text-gray-700">Simulate</span>

        {sim.status !== "idle" ? (
          <>
            <div
              className={`w-2 h-2 rounded-full ${statusColor} ${
                sim.status === "running" ? "animate-pulse" : ""
              }`}
            />
            <span className="text-xs text-gray-500">{formatElapsed(sim.elapsed)}</span>
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-4 ${
                sim.status === "running"
                  ? "border-green-400 text-green-700"
                  : "border-amber-400 text-amber-700"
              }`}
            >
              {sim.status === "running" ? "LIVE" : "PAUSED"}
            </Badge>
            {/* Per-API live RPS chips */}
            <div className="flex gap-1 ml-1">
              {sim.apiBreakdown.slice(0, 4).map((ab) => {
                const api = sim.apis.find((a) => a.id === ab.apiId);
                if (!api) return null;
                return (
                  <span
                    key={ab.apiId}
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                      METHOD_COLORS[api.method] ?? ""
                    }`}
                  >
                    {api.name.split(" ")[0]} {ab.rps.toLocaleString()}/s
                  </span>
                );
              })}
            </div>
          </>
        ) : (
          <span className="text-xs text-gray-400">
            {formatUsers(sim.concurrentUsers)} users · {sim.apis.length} APIs
            {totalInteractions > 0 && ` · ${totalInteractions} interactions`}
          </span>
        )}

        <span className="ml-auto text-gray-400">
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="flex h-[336px] divide-x divide-gray-100">
          {/* Left: API list with per-API interactions */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50/60">
              <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">
                API Endpoints
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => sim.addApi()}
                disabled={sim.status !== "idle"}
                className="h-5 px-1.5 text-[10px] gap-0.5"
              >
                <Plus size={9} /> Add API
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {sim.apis.length === 0 && (
                <div className="flex items-center justify-center h-16 text-xs text-gray-400">
                  No APIs — add one above
                </div>
              )}
              {sim.apis.map((api) => {
                const pct = Math.round((api.weight / totalWeight) * 100);
                const apiRps = sim.apiBreakdown.find((ab) => ab.apiId === api.id)?.rps;
                const isExpanded = expandedApiId === api.id;
                return (
                  <ApiRow
                    key={api.id}
                    api={api}
                    pct={pct}
                    liveRps={apiRps}
                    expanded={isExpanded}
                    disabled={sim.status !== "idle"}
                    allNodes={allNodes}
                    edges={edges}
                    cacheNodes={cacheNodes}
                    dbNodes={dbNodes}
                    componentDefs={componentDefs}
                    allApis={sim.apis}
                    onToggle={() => setExpandedApiId(isExpanded ? null : api.id)}
                    onChange={(patch) => sim.updateApi(api.id, patch)}
                    onRemove={() => sim.removeApi(api.id)}
                    onAddCacheInteraction={(nodeId, op) =>
                      sim.addCacheInteraction(api.id, nodeId, op)
                    }
                    onUpdateCacheInteraction={(id, patch) =>
                      sim.updateCacheInteraction(api.id, id, patch)
                    }
                    onRemoveCacheInteraction={(id) => sim.removeCacheInteraction(api.id, id)}
                    onAddDbInteraction={(nodeId) => sim.addDbInteraction(api.id, nodeId)}
                    onUpdateDbInteraction={(id, patch) =>
                      sim.updateDbInteraction(api.id, id, patch)
                    }
                    onRemoveDbInteraction={(id) => sim.removeDbInteraction(api.id, id)}
                  />
                );
              })}
            </div>
          </div>

          {/* Right: controls + user count + metrics */}
          <div className="w-56 flex flex-col divide-y divide-gray-100">
            {/* User count */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Users size={11} className="text-gray-400" />
                <span className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
                  Concurrent Users
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-lg font-bold text-gray-800 tabular-nums">
                  {formatUsers(sim.concurrentUsers)}
                </span>
                <span className="text-[10px] text-gray-400">
                  ~{sim.concurrentUsers.toLocaleString()} req/s
                </span>
              </div>
              <Slider
                value={[sim.concurrentUsers]}
                onValueChange={([v]) => sim.setConcurrentUsers(v)}
                min={100}
                max={50000}
                step={100}
                disabled={sim.status !== "idle"}
              />
              <div className="flex gap-1 flex-wrap mt-2">
                {[500, 1000, 5000, 10000].map((n) => (
                  <button
                    key={n}
                    onClick={() => sim.setConcurrentUsers(n)}
                    disabled={sim.status !== "idle"}
                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      sim.concurrentUsers === n
                        ? "bg-violet-100 border-violet-300 text-violet-700"
                        : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {formatUsers(n)}
                  </button>
                ))}
              </div>
            </div>

            {/* Per-API breakdown (live) */}
            {sim.status !== "idle" && sim.apiBreakdown.length > 0 && (
              <div className="px-4 py-2">
                <div className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wide">
                  Per-API Traffic
                </div>
                <div className="space-y-1">
                  {sim.apiBreakdown.map((ab) => {
                    const api = sim.apis.find((a) => a.id === ab.apiId);
                    if (!api) return null;
                    return (
                      <div key={ab.apiId} className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-bold px-1 py-0.5 rounded border shrink-0 ${
                            METHOD_COLORS[api.method] ?? ""
                          }`}
                        >
                          {api.method}
                        </span>
                        <span className="text-[10px] text-gray-600 flex-1 truncate">
                          {api.name}
                        </span>
                        <span className="text-[10px] font-mono text-gray-500 shrink-0">
                          {ab.rps.toLocaleString()}/s
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="text-[10px] text-gray-400">avg util</span>
                  <span
                    className="text-[11px] font-bold ml-auto"
                    style={{
                      color:
                        avgUtil < 0.6
                          ? "#22c55e"
                          : avgUtil < 0.85
                          ? "#f59e0b"
                          : "#ef4444",
                    }}
                  >
                    {Math.round(avgUtil * 100)}%
                  </span>
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex-1 flex flex-col items-center justify-center gap-2 px-4 py-3">
              {sim.status === "idle" ? (
                <Button
                  onClick={handleStart}
                  disabled={nodes.length === 0 || sim.apis.length === 0}
                  className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Play size={14} /> Start
                </Button>
              ) : (
                <>
                  <div className="text-center">
                    <div
                      className={`text-xl font-mono font-bold tabular-nums ${
                        sim.status === "running" ? "text-gray-800" : "text-amber-600"
                      }`}
                    >
                      {formatElapsed(sim.elapsed)}
                    </div>
                    <div className="text-[10px] text-gray-400">elapsed</div>
                  </div>
                  <div className="flex gap-2 w-full">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePause}
                      className="flex-1 gap-1"
                    >
                      {sim.status === "paused" ? (
                        <Play size={12} />
                      ) : (
                        <Pause size={12} />
                      )}
                      {sim.status === "paused" ? "Resume" : "Pause"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleStop}
                      className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    >
                      <Square size={12} />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── API Row ───────────────────────────────────────────────────────────────────

function ApiRow({
  api, pct, liveRps, expanded, disabled,
  allNodes, edges, cacheNodes, dbNodes, componentDefs, allApis,
  onToggle, onChange, onRemove,
  onAddCacheInteraction, onUpdateCacheInteraction, onRemoveCacheInteraction,
  onAddDbInteraction, onUpdateDbInteraction, onRemoveDbInteraction,
}: {
  api: ApiDef;
  pct: number;
  liveRps?: number;
  expanded: boolean;
  disabled: boolean;
  allNodes: Node<DesignNodeData>[];
  edges: Edge[];
  cacheNodes: Node<DesignNodeData>[];
  dbNodes: Node<DesignNodeData>[];
  componentDefs: ComponentDef[];
  allApis: ApiDef[];
  onToggle: () => void;
  onChange: (patch: Partial<ApiDef>) => void;
  onRemove: () => void;
  onAddCacheInteraction: (nodeId: string, op: "read" | "write") => void;
  onUpdateCacheInteraction: (id: string, patch: Partial<CacheInteraction>) => void;
  onRemoveCacheInteraction: (id: string) => void;
  onAddDbInteraction: (nodeId: string) => void;
  onUpdateDbInteraction: (id: string, patch: Partial<DbInteraction>) => void;
  onRemoveDbInteraction: (id: string) => void;
}) {
  const interactionCount = api.cacheInteractions.length + api.dbInteractions.length;

  return (
    <div className="border-b border-gray-50 last:border-0">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left"
      >
        <span
          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
            METHOD_COLORS[api.method] ?? ""
          }`}
        >
          {api.method}
        </span>
        <span className="text-xs text-gray-700 flex-1 truncate">{api.name}</span>
        {liveRps !== undefined ? (
          <span className="text-[10px] font-mono text-violet-600 shrink-0">
            {liveRps.toLocaleString()}/s
          </span>
        ) : (
          <span className="text-[10px] text-gray-400 shrink-0">{pct}%</span>
        )}
        {interactionCount > 0 && (
          <span className="text-[9px] bg-violet-100 text-violet-600 rounded px-1 shrink-0">
            {interactionCount}
          </span>
        )}
      </button>

      {/* Expanded config */}
      {expanded && !disabled && (
        <div className="px-3 pb-3 space-y-2 bg-gray-50/70 border-t border-gray-100">
          {/* Basic config */}
          <div className="pt-2 space-y-1.5">
            <input
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white"
              value={api.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="API name"
            />
            <div className="flex gap-1">
              {(["GET", "POST", "PUT", "DELETE"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => onChange({ method: m })}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    api.method === m
                      ? METHOD_COLORS[m]
                      : "border-gray-200 text-gray-400 bg-white hover:bg-gray-100"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                <span>Traffic weight</span>
                <span className="font-medium text-gray-700">{api.weight} ({pct}%)</span>
              </div>
              <Slider
                value={[api.weight]}
                onValueChange={([v]) => onChange({ weight: v })}
                min={1}
                max={100}
                step={1}
              />
            </div>
          </div>

          {/* Cache interactions */}
          <CacheInteractionSection
            api={api}
            allNodes={allNodes}
            edges={edges}
            cacheNodes={cacheNodes}
            componentDefs={componentDefs}
            allApis={allApis}
            onAdd={onAddCacheInteraction}
            onUpdate={onUpdateCacheInteraction}
            onRemove={onRemoveCacheInteraction}
          />

          {/* DB interactions */}
          <DbInteractionSection
            api={api}
            allNodes={allNodes}
            edges={edges}
            dbNodes={dbNodes}
            componentDefs={componentDefs}
            allApis={allApis}
            onAdd={onAddDbInteraction}
            onUpdate={onUpdateDbInteraction}
            onRemove={onRemoveDbInteraction}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-5 px-1.5 text-[10px] text-red-500 hover:bg-red-50 gap-0.5"
          >
            <Trash2 size={9} /> Remove API
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Cache Interaction Section ─────────────────────────────────────────────────

// Build a list of { edgeId, sourceLabel, targetNodeId, targetLabel } for edges
// where the target is in the given node set.
function buildEdgeOptions(
  edges: Edge[],
  allNodes: Node<DesignNodeData>[],
  targetNodes: Node<DesignNodeData>[]
): { key: string; nodeId: string; label: string }[] {
  const targetIds = new Set(targetNodes.map((n) => n.id));
  const seen = new Set<string>();
  const result: { key: string; nodeId: string; label: string }[] = [];
  for (const e of edges) {
    if (!targetIds.has(e.target)) continue;
    if (seen.has(e.target)) continue; // deduplicate by target node
    seen.add(e.target);
    const src = allNodes.find((n) => n.id === e.source);
    const tgt = allNodes.find((n) => n.id === e.target);
    const srcLabel = src?.data.label ?? e.source;
    const tgtLabel = tgt?.data.label ?? e.target;
    result.push({ key: e.target, nodeId: e.target, label: `${srcLabel} → ${tgtLabel}` });
  }
  return result;
}

function CacheInteractionSection({
  api, allNodes, edges, cacheNodes, componentDefs, allApis, onAdd, onUpdate, onRemove,
}: {
  api: ApiDef;
  allNodes: Node<DesignNodeData>[];
  edges: Edge[];
  cacheNodes: Node<DesignNodeData>[];
  componentDefs: ComponentDef[];
  allApis: ApiDef[];
  onAdd: (nodeId: string, op: "read" | "write") => void;
  onUpdate: (id: string, patch: Partial<CacheInteraction>) => void;
  onRemove: (id: string) => void;
}) {
  const cacheEdges = buildEdgeOptions(edges, allNodes, cacheNodes);
  const [newNodeId, setNewNodeId] = useState(cacheEdges[0]?.nodeId ?? "");
  const [newOp, setNewOp] = useState<"read" | "write">("read");
  void componentDefs;

  // Collect all write interactions across all APIs for the "populated by" selector
  const allWriteInteractions: { id: string; label: string }[] = [];
  for (const a of allApis) {
    for (const ci of a.cacheInteractions) {
      if (ci.operation === "write") {
        const nodeLabel =
          (cacheNodes.find((n) => n.id === ci.nodeId)?.data as DesignNodeData | undefined)
            ?.label ?? ci.nodeId;
        allWriteInteractions.push({
          id: ci.id,
          label: `${a.name} → ${nodeLabel}${ci.keyPattern ? ` (${ci.keyPattern})` : ""}`,
        });
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-cyan-600">
          <Database size={9} />
          Cache Interactions
        </div>
        {cacheEdges.length > 0 && (
          <div className="flex items-center gap-1">
            <select
              value={newNodeId}
              onChange={(e) => setNewNodeId(e.target.value)}
              className="text-[9px] border border-gray-200 rounded px-1 py-0.5 bg-white focus:outline-none max-w-[140px]"
            >
              {cacheEdges.map((opt) => (
                <option key={opt.key} value={opt.nodeId}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => setNewOp((o) => (o === "read" ? "write" : "read"))}
              className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${
                newOp === "read"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-orange-50 border-orange-200 text-orange-700"
              }`}
            >
              {newOp.toUpperCase()}
            </button>
            <button
              onClick={() => newNodeId && onAdd(newNodeId, newOp)}
              disabled={!newNodeId}
              className="text-[9px] px-1.5 py-0.5 rounded border bg-white border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 flex items-center gap-0.5"
            >
              <Plus size={8} />
            </button>
          </div>
        )}
        {cacheEdges.length === 0 && (
          <span className="text-[9px] text-gray-400">No cache connections on canvas</span>
        )}
      </div>

      {api.cacheInteractions.length === 0 && (
        <p className="text-[10px] text-gray-400 italic pl-1">
          No cache interactions — cache nodes show 0 ops without one.
        </p>
      )}

      <div className="space-y-1.5">
        {api.cacheInteractions.map((ci) => (
          <CacheInteractionRow
            key={ci.id}
            interaction={ci}
            cacheNodes={cacheNodes}
            allWriteInteractions={allWriteInteractions}
            onUpdate={(patch) => onUpdate(ci.id, patch)}
            onRemove={() => onRemove(ci.id)}
          />
        ))}
      </div>
    </div>
  );
}

function CacheInteractionRow({
  interaction, cacheNodes, allWriteInteractions, onUpdate, onRemove,
}: {
  interaction: CacheInteraction;
  cacheNodes: Node<DesignNodeData>[];
  allWriteInteractions: { id: string; label: string }[];
  onUpdate: (patch: Partial<CacheInteraction>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const nodeLabel =
    (cacheNodes.find((n) => n.id === interaction.nodeId)?.data as DesignNodeData | undefined)
      ?.label ?? "Unknown";
  const isRead = interaction.operation === "read";

  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span
          className={`text-[9px] font-bold px-1 py-0.5 rounded border shrink-0 ${
            isRead
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-orange-50 border-orange-200 text-orange-700"
          }`}
        >
          {isRead ? "READ" : "WRITE"}
        </span>
        <span className="text-[10px] text-gray-600 flex-1 truncate">
          {nodeLabel}
          {interaction.keyPattern && (
            <span className="text-gray-400"> · {interaction.keyPattern}</span>
          )}
        </span>
        {isRead && interaction.populatedBy && (
          <Link2 size={9} className="text-violet-400 shrink-0" />
        )}
        {!isRead && interaction.fanoutFactor > 1 && (
          <Zap size={9} className="text-orange-400 shrink-0" />
        )}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-gray-400 hover:text-gray-600 shrink-0"
        >
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
        <button onClick={onRemove} className="text-red-400 hover:text-red-600 shrink-0">
          <Trash2 size={10} />
        </button>
      </div>

      {expanded && (
        <div className="px-2 pb-2 pt-0 space-y-1.5 border-t border-gray-100">
          {/* Key pattern */}
          <div>
            <label className="text-[9px] text-gray-500 block mb-0.5">Key pattern (docs only)</label>
            <input
              className="w-full text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-violet-400"
              value={interaction.keyPattern}
              onChange={(e) => onUpdate({ keyPattern: e.target.value })}
              placeholder="e.g. feed:{userId}"
            />
          </div>

          {/* Cache node */}
          <div>
            <label className="text-[9px] text-gray-500 block mb-0.5">Cache node</label>
            <select
              value={interaction.nodeId}
              onChange={(e) => onUpdate({ nodeId: e.target.value })}
              className="w-full text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none"
            >
              {cacheNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {(n.data as DesignNodeData).label}
                </option>
              ))}
            </select>
          </div>

          {isRead ? (
            <>
              {/* Read: populated by (interlinking) */}
              <div>
                <label className="text-[9px] text-gray-500 block mb-0.5">
                  <Link2 size={8} className="inline mr-0.5" />
                  Populated by (write interaction)
                </label>
                <select
                  value={interaction.populatedBy ?? ""}
                  onChange={(e) =>
                    onUpdate({ populatedBy: e.target.value || undefined })
                  }
                  className="w-full text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none"
                >
                  <option value="">— standalone (use hit rate below) —</option>
                  {allWriteInteractions.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Standalone read: TTL and hit rate */}
              {!interaction.populatedBy && (
                <>
                  <div>
                    <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
                      <span>Expected TTL</span>
                      <span className="font-medium text-gray-700">
                        {formatTTL(interaction.ttlSeconds)}
                      </span>
                    </div>
                    <Slider
                      value={[interaction.ttlSeconds]}
                      onValueChange={([v]) => onUpdate({ ttlSeconds: v })}
                      min={5}
                      max={3600}
                      step={5}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
                      <span>Target hit rate</span>
                      <span className="font-medium text-gray-700">
                        {interaction.targetHitRatePct}%
                      </span>
                    </div>
                    <Slider
                      value={[interaction.targetHitRatePct]}
                      onValueChange={([v]) => onUpdate({ targetHitRatePct: v })}
                      min={5}
                      max={99}
                      step={1}
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              {/* Write: TTL, fanout, unique keys */}
              <div>
                <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
                  <span>TTL (how long keys live)</span>
                  <span className="font-medium text-gray-700">
                    {formatTTL(interaction.ttlSeconds)}
                  </span>
                </div>
                <Slider
                  value={[interaction.ttlSeconds]}
                  onValueChange={([v]) => onUpdate({ ttlSeconds: v })}
                  min={1}
                  max={3600}
                  step={1}
                />
                <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                  <span>1s</span>
                  <span>1h</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
                  <span>
                    <Zap size={8} className="inline mr-0.5 text-orange-400" />
                    Fan-out factor
                  </span>
                  <span className="font-medium text-gray-700">×{interaction.fanoutFactor}</span>
                </div>
                <Slider
                  value={[interaction.fanoutFactor]}
                  onValueChange={([v]) => onUpdate({ fanoutFactor: v })}
                  min={1}
                  max={1000}
                  step={1}
                />
                <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                  <span>1 (no fanout)</span>
                  <span>1000</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
                  <span>Unique keys (key space)</span>
                  <span className="font-medium text-gray-700">
                    {interaction.uniqueKeys.toLocaleString()}
                  </span>
                </div>
                <Slider
                  value={[interaction.uniqueKeys]}
                  onValueChange={([v]) => onUpdate({ uniqueKeys: v })}
                  min={100}
                  max={1000000}
                  step={100}
                />
                <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
                  <span>100</span>
                  <span>1M</span>
                </div>
                <p className="text-[9px] text-gray-400 mt-0.5">
                  Smaller key space → higher hit rate for linked reads
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── DB Interaction Section ────────────────────────────────────────────────────

function DbInteractionSection({
  api, allNodes, edges, dbNodes, componentDefs, allApis, onAdd, onUpdate, onRemove,
}: {
  api: ApiDef;
  allNodes: Node<DesignNodeData>[];
  edges: Edge[];
  dbNodes: Node<DesignNodeData>[];
  componentDefs: ComponentDef[];
  allApis: ApiDef[];
  onAdd: (nodeId: string) => void;
  onUpdate: (id: string, patch: Partial<DbInteraction>) => void;
  onRemove: (id: string) => void;
}) {
  const dbEdges = buildEdgeOptions(edges, allNodes, dbNodes);
  const [newNodeId, setNewNodeId] = useState(dbEdges[0]?.nodeId ?? "");
  void componentDefs;

  // All cache read interactions across all APIs (for cache fallthrough linking)
  const allReadInteractions: { id: string; label: string }[] = [];
  for (const a of allApis) {
    for (const ci of a.cacheInteractions) {
      if (ci.operation === "read") {
        const nodeLabel =
          (dbNodes.find((n) => n.id === ci.nodeId)?.data as DesignNodeData | undefined)?.label ??
          ci.nodeId;
        allReadInteractions.push({
          id: ci.id,
          label: `${a.name} → cache${ci.keyPattern ? ` (${ci.keyPattern})` : ""}`,
        });
        void nodeLabel;
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1 text-[10px] font-semibold text-blue-600">
          <ArrowUpDown size={9} />
          DB Interactions
        </div>
        {dbEdges.length > 0 && (
          <div className="flex items-center gap-1">
            <select
              value={newNodeId}
              onChange={(e) => setNewNodeId(e.target.value)}
              className="text-[9px] border border-gray-200 rounded px-1 py-0.5 bg-white focus:outline-none max-w-[140px]"
            >
              {dbEdges.map((opt) => (
                <option key={opt.key} value={opt.nodeId}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => newNodeId && onAdd(newNodeId)}
              disabled={!newNodeId}
              className="text-[9px] px-1.5 py-0.5 rounded border bg-white border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-40 flex items-center gap-0.5"
            >
              <Plus size={8} />
            </button>
          </div>
        )}
        {dbEdges.length === 0 && (
          <span className="text-[9px] text-gray-400">No DB connections on canvas</span>
        )}
      </div>

      {api.dbInteractions.length === 0 && (
        <p className="text-[10px] text-gray-400 italic pl-1">
          No DB interactions — DB nodes show 0 load without one.
        </p>
      )}

      <div className="space-y-1.5">
        {api.dbInteractions.map((di) => (
          <DbInteractionRow
            key={di.id}
            interaction={di}
            dbNodes={dbNodes}
            allReadInteractions={allReadInteractions}
            onUpdate={(patch) => onUpdate(di.id, patch)}
            onRemove={() => onRemove(di.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DbInteractionRow({
  interaction, dbNodes, allReadInteractions, onUpdate, onRemove,
}: {
  interaction: DbInteraction;
  dbNodes: Node<DesignNodeData>[];
  allReadInteractions: { id: string; label: string }[];
  onUpdate: (patch: Partial<DbInteraction>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const nodeLabel =
    (dbNodes.find((n) => n.id === interaction.nodeId)?.data as DesignNodeData | undefined)
      ?.label ?? "Unknown";

  return (
    <div className="rounded border border-gray-200 bg-white">
      <div className="flex items-center gap-1.5 px-2 py-1">
        <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-blue-50 border-blue-200 text-blue-700 shrink-0">
          DB
        </span>
        <span className="text-[10px] text-gray-600 flex-1 truncate">
          {nodeLabel}
          <span className="text-gray-400">
            {" "}· {interaction.queriesPerRequest}q · {Math.round(interaction.readFraction * 100)}% reads
          </span>
          {interaction.cacheFallthrough && (
            <span className="text-violet-500"> · via cache miss</span>
          )}
        </span>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-gray-400 hover:text-gray-600 shrink-0"
        >
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        </button>
        <button onClick={onRemove} className="text-red-400 hover:text-red-600 shrink-0">
          <Trash2 size={10} />
        </button>
      </div>

      {expanded && (
        <div className="px-2 pb-2 pt-0 space-y-1.5 border-t border-gray-100">
          {/* DB node */}
          <div>
            <label className="text-[9px] text-gray-500 block mb-0.5">Database node</label>
            <select
              value={interaction.nodeId}
              onChange={(e) => onUpdate({ nodeId: e.target.value })}
              className="w-full text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none"
            >
              {dbNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {(n.data as DesignNodeData).label}
                </option>
              ))}
            </select>
          </div>

          {/* Queries per request */}
          <div>
            <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
              <span>Queries per request</span>
              <span className="font-medium text-gray-700">{interaction.queriesPerRequest}</span>
            </div>
            <Slider
              value={[interaction.queriesPerRequest]}
              onValueChange={([v]) => onUpdate({ queriesPerRequest: v })}
              min={1}
              max={20}
              step={1}
            />
            <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
              <span>1</span>
              <span>20</span>
            </div>
          </div>

          {/* Read fraction */}
          <div>
            <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
              <span>Read fraction</span>
              <span className="font-medium text-gray-700">
                {Math.round(interaction.readFraction * 100)}%
              </span>
            </div>
            <Slider
              value={[Math.round(interaction.readFraction * 100)]}
              onValueChange={([v]) => onUpdate({ readFraction: v / 100 })}
              min={0}
              max={100}
              step={5}
            />
          </div>

          {/* Cache fallthrough */}
          <div>
            <label className="flex items-center gap-2 text-[9px] text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={interaction.cacheFallthrough}
                onChange={(e) => onUpdate({ cacheFallthrough: e.target.checked })}
                className="rounded"
              />
              Only query DB on cache miss (cache fallthrough)
            </label>
            {interaction.cacheFallthrough && (
              <div className="mt-1">
                <label className="text-[9px] text-gray-500 block mb-0.5">
                  <Link2 size={8} className="inline mr-0.5" />
                  Linked cache read interaction
                </label>
                <select
                  value={interaction.cacheInteractionId ?? ""}
                  onChange={(e) =>
                    onUpdate({ cacheInteractionId: e.target.value || undefined })
                  }
                  className="w-full text-[10px] border border-gray-200 rounded px-1.5 py-0.5 bg-white focus:outline-none"
                >
                  <option value="">— not linked —</option>
                  {allReadInteractions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

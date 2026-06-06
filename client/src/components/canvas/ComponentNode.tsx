import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import * as LucideIcons from "lucide-react";
import { AlertCircle } from "lucide-react";
import { useDesignStore } from "@/store/designStore";
import { useSimulationStore } from "@/store/simulationStore";
import { CATEGORY_COLORS } from "@/lib/categoryColors";
import { NodeMetricsPanel } from "@/components/simulation/NodeMetricsPanel";
import type { DesignNodeData } from "@/lib/types";

function utilBorderColor(u: number): string {
  if (u < 0.6) return "#22c55e";
  if (u < 0.85) return "#f59e0b";
  return "#ef4444";
}

export const ComponentNode = memo(function ComponentNode({ id, data, selected }: NodeProps) {
  const nodeData = data as DesignNodeData;
  const { componentDefs } = useDesignStore();
  const { status: simStatus, metrics } = useSimulationStore();
  const [hovered, setHovered] = useState(false);

  const def = componentDefs.find((d) => d.id === nodeData.defId);

  const color = def ? (CATEGORY_COLORS[def.category] ?? "slate") : "slate";
  const Icon = def
    ? ((LucideIcons[def.icon as keyof typeof LucideIcons] ?? LucideIcons.Box) as React.FC<{ size?: number; className?: string }>)
    : LucideIcons.Box;

  // Check for missing required params
  const missingRequired = def
    ? def.params.filter((p) => {
        if (!p.required) return false;
        const val = nodeData.params[p.key];
        return val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0);
      })
    : [];

  // Build card summary
  const summaryLines = def
    ? def.cardSummary.slice(0, 3).map((key) => {
        const paramDef = def.params.find((p) => p.key === key);
        const val = nodeData.params[key];
        if (val === undefined || val === null) return null;
        const displayVal = Array.isArray(val) ? `${val.length} items` : String(val);
        return `${paramDef?.label ?? key}: ${displayVal}`;
      }).filter(Boolean)
    : [];

  // Simulation
  const nodeMetrics = metrics[id];
  const isSimRunning = simStatus === "running" || simStatus === "paused";
  const utilization = nodeMetrics?.utilization ?? 0;
  const ringColor = isSimRunning && nodeMetrics ? utilBorderColor(utilization) : undefined;

  return (
    <div
      className="relative"
      style={{ overflow: "visible" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={`w-44 rounded-lg border-2 bg-white shadow-sm transition-all`}
        style={
          ringColor
            ? { borderColor: ringColor, boxShadow: `0 0 0 3px ${ringColor}22` }
            : selected
            ? undefined
            : undefined
        }
        data-selected={selected}
      >
        {/* Selection ring when not simulating */}
        {!ringColor && (
          <style>{`[data-selected="true"] { border-color: var(--tw-ring-color, #8b5cf6); }`}</style>
        )}

        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />

        {/* Header */}
        <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-t-md bg-${color}-50 border-b border-${color}-100`}>
          <div className={`w-5 h-5 rounded flex items-center justify-center bg-${color}-100 shrink-0 relative`}>
            <Icon size={12} className={`text-${color}-600`} />
            {/* Pulse dot during simulation */}
            {isSimRunning && simStatus === "running" && (
              <span
                className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full animate-ping"
                style={{ backgroundColor: ringColor ?? "#8b5cf6", opacity: 0.7 }}
              />
            )}
          </div>
          <div className="min-w-0">
            <p className={`text-[10px] font-bold text-${color}-700 uppercase tracking-wide leading-none`}>
              {def?.category ?? "Component"}
            </p>
            <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{nodeData.label}</p>
          </div>
        </div>

        {/* Param summaries OR live metric summary */}
        {isSimRunning && nodeMetrics ? (
          <div className="px-2 py-1.5 space-y-0.5">
            {nodeMetrics.specs.slice(0, 3).map((spec) => {
              const v = nodeMetrics.current[spec.key];
              if (v === undefined) return null;
              const fmt = v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v < 10 ? v.toFixed(1) : Math.round(v).toString();
              return (
                <p key={spec.key} className="text-[10px] text-gray-500 truncate">
                  <span className="text-gray-700 font-medium">{fmt}</span>
                  <span className="text-gray-400"> {spec.unit}</span>
                  <span className="text-gray-400"> · {spec.label}</span>
                </p>
              );
            })}
          </div>
        ) : (
          summaryLines.length > 0 && (
            <div className="px-2 py-1.5 space-y-0.5">
              {summaryLines.map((line, i) => (
                <p key={i} className="text-[10px] text-gray-500 truncate">{line}</p>
              ))}
            </div>
          )
        )}

        {/* Validation warning (only when not simulating) */}
        {!isSimRunning && missingRequired.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 border-t border-red-100 bg-red-50 rounded-b-md">
            <AlertCircle size={10} className="text-red-500 shrink-0" />
            <p className="text-[9px] text-red-600 font-medium">Missing required inputs</p>
          </div>
        )}

        {/* Utilization bar at bottom during simulation */}
        {isSimRunning && nodeMetrics && (
          <div className="h-1 rounded-b-md overflow-hidden bg-gray-100">
            <div
              className="h-full transition-all duration-700"
              style={{
                width: `${Math.min(100, utilization * 100)}%`,
                backgroundColor: ringColor,
              }}
            />
          </div>
        )}

        <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-gray-400 !border-2 !border-white" />
      </div>

      {/* Hover metrics panel — only during simulation */}
      {isSimRunning && hovered && nodeMetrics && (
        <NodeMetricsPanel metrics={nodeMetrics} label={nodeData.label} />
      )}
    </div>
  );
});

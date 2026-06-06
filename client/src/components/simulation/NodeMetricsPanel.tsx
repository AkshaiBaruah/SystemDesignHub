import type { NodeMetrics, MetricSpec } from "@/simulation/types";
import { Sparkline } from "./Sparkline";

type Props = {
  metrics: NodeMetrics;
  label: string;
};

function utilColor(u: number): string {
  if (u < 0.6) return "#22c55e"; // green-500
  if (u < 0.85) return "#f59e0b"; // amber-500
  return "#ef4444"; // red-500
}

function metricColor(spec: MetricSpec, value: number): string {
  if (spec.warnAbove !== undefined && value >= spec.warnAbove) return "text-red-500";
  if (spec.goodBelow !== undefined && value > spec.goodBelow) return "text-green-600";
  return "text-gray-800";
}

function formatValue(v: number, spec: MetricSpec): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  if (spec.decimals !== undefined) return v.toFixed(spec.decimals);
  if (v < 10) return v.toFixed(2);
  if (v < 100) return v.toFixed(1);
  return Math.round(v).toLocaleString();
}

export function NodeMetricsPanel({ metrics, label }: Props) {
  const { utilization, specs, current, series, primaryKey } = metrics;
  const col = utilColor(utilization);
  const sparkData = series[primaryKey] ?? [];

  // Build ordered metric list, filter out metrics with no data
  const displaySpecs = specs.filter((s) => current[s.key] !== undefined);

  return (
    <div
      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 nodrag nopan pointer-events-none"
      style={{ width: 240 }}
    >
      <div className="bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0 animate-pulse"
            style={{ backgroundColor: col }}
          />
          <span className="text-[11px] font-semibold text-gray-700 truncate">{label}</span>
          <span className="ml-auto text-[10px] text-gray-400">
            {Math.round(utilization * 100)}% util.
          </span>
        </div>

        {/* Sparkline */}
        {sparkData.length >= 2 && (
          <div className="px-3 pt-2 pb-1 bg-white">
            <div className="text-[9px] text-gray-400 mb-0.5 uppercase tracking-wider">
              {specs.find((s) => s.key === primaryKey)?.label ?? primaryKey}
            </div>
            <Sparkline data={sparkData} width={216} height={32} color={col} />
          </div>
        )}

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-px bg-gray-100 border-t border-gray-100">
          {displaySpecs.map((spec) => {
            const v = current[spec.key] ?? 0;
            return (
              <div key={spec.key} className="bg-white px-2.5 py-1.5">
                <div className="text-[9px] text-gray-400 truncate leading-none mb-0.5">{spec.label}</div>
                <div className={`text-xs font-mono font-semibold leading-none ${metricColor(spec, v)}`}>
                  {formatValue(v, spec)}
                  <span className="text-[9px] font-normal text-gray-400 ml-0.5">{spec.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

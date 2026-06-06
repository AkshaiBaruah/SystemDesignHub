import { AlertTriangle, Zap, Lightbulb, AlertCircle, PackagePlus, Copy } from "lucide-react";
import { useDesignStore } from "@/store/designStore";
import { ScoreGauge } from "./ScoreGauge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AnalysisContent() {
  const { analysisResult, analysisLoading, analysisError, selectNode } = useDesignStore();

  if (analysisLoading) {
    return (
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-24 h-24 rounded-full bg-gray-100 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-100 animate-pulse rounded w-3/4" />
            <div className="h-3 bg-gray-100 animate-pulse rounded w-1/2" />
          </div>
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (analysisError) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-32">
        <AlertCircle size={24} className="text-red-400 mb-2" />
        <p className="text-sm text-red-600 text-center">{analysisError}</p>
      </div>
    );
  }

  if (!analysisResult) return null;

  const r = analysisResult;

  const copyJson = () => navigator.clipboard.writeText(JSON.stringify(r, null, 2));
  const copyText = () => {
    const text = [
      `Score: ${r.score}/100 — ${r.score_rationale}`,
      "",
      r.spofs.length > 0 ? `SPOFs:\n${r.spofs.map((s) => `• ${s.issue} → ${s.fix}`).join("\n")}` : "",
      r.warnings.length > 0 ? `Warnings:\n${r.warnings.map((w) => `• ${w.param}: ${w.issue} (recommended: ${w.recommended_value})`).join("\n")}` : "",
      r.bottlenecks.length > 0 ? `Bottlenecks:\n${r.bottlenecks.map((b) => `• [${b.severity}] ${b.component}: ${b.reason}`).join("\n")}` : "",
      r.suggestions.length > 0 ? `Suggestions:\n${r.suggestions.map((s) => `• ${s.title}: ${s.detail}`).join("\n")}` : "",
      `Summary: ${r.summary}`,
    ].filter(Boolean).join("\n\n");
    navigator.clipboard.writeText(text);
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Score + actions */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <ScoreGauge score={r.score} />
            <p className="text-xs text-gray-600 max-w-[200px]">{r.score_rationale}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={copyJson}>
              <Copy size={10} /> JSON
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={copyText}>
              <Copy size={10} /> Text
            </Button>
          </div>
        </div>

        {/* SPOFs */}
        {r.spofs.length > 0 && (
          <Section title="Single Points of Failure" icon={<AlertCircle size={13} className="text-red-500" />}>
            {r.spofs.map((s, i) => (
              <button
                key={i}
                onClick={() => selectNode(s.node_id)}
                className="w-full text-left p-2 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
              >
                <p className="text-xs font-semibold text-red-700">{s.issue}</p>
                <p className="text-[10px] text-red-500 mt-0.5">Fix: {s.fix}</p>
                <p className="text-[9px] text-red-400 mt-0.5 font-mono">node: {s.node_id}</p>
              </button>
            ))}
          </Section>
        )}

        {/* Warnings */}
        {r.warnings.length > 0 && (
          <Section title="Warnings" icon={<AlertTriangle size={13} className="text-amber-500" />}>
            {r.warnings.map((w, i) => (
              <div key={i} className="p-2 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-xs font-semibold text-amber-700">{w.param}</p>
                <p className="text-[10px] text-amber-600 mt-0.5">{w.issue}</p>
                <p className="text-[10px] text-amber-500 mt-0.5">Recommended: {w.recommended_value}</p>
              </div>
            ))}
          </Section>
        )}

        {/* Bottlenecks */}
        {r.bottlenecks.length > 0 && (
          <Section title="Bottlenecks" icon={<Zap size={13} className="text-orange-500" />}>
            {r.bottlenecks.map((b, i) => (
              <div key={i} className="p-2 bg-orange-50 border border-orange-200 rounded-md">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                    b.severity === "high" ? "bg-red-100 text-red-700" :
                    b.severity === "medium" ? "bg-orange-100 text-orange-700" :
                    "bg-yellow-100 text-yellow-700"
                  }`}>{b.severity}</span>
                  <p className="text-xs font-semibold text-orange-700">{b.component}</p>
                </div>
                <p className="text-[10px] text-orange-600">{b.reason}</p>
              </div>
            ))}
          </Section>
        )}

        {/* Missing components */}
        {r.missing_components.length > 0 && (
          <Section title="Missing Components" icon={<PackagePlus size={13} className="text-purple-500" />}>
            {r.missing_components.map((m, i) => (
              <div key={i} className="p-2 bg-purple-50 border border-purple-200 rounded-md">
                <p className="text-xs font-semibold text-purple-700">{m.component_type}</p>
                <p className="text-[10px] text-purple-600 mt-0.5">{m.reason}</p>
              </div>
            ))}
          </Section>
        )}

        {/* Suggestions */}
        {r.suggestions.length > 0 && (
          <Section title="Suggestions" icon={<Lightbulb size={13} className="text-blue-500" />}>
            {r.suggestions.map((s, i) => (
              <div key={i} className="p-2 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-xs font-semibold text-blue-700">{s.title}</p>
                <p className="text-[10px] text-blue-600 mt-0.5">{s.detail}</p>
                {s.affected_nodes.length > 0 && (
                  <p className="text-[9px] text-blue-400 mt-0.5 font-mono">
                    nodes: {s.affected_nodes.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </Section>
        )}

        {/* Summary */}
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs font-semibold text-gray-700 mb-1">Summary</p>
          <p className="text-xs text-gray-600 leading-relaxed">{r.summary}</p>
        </div>
      </div>
    </ScrollArea>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <h3 className="text-xs font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

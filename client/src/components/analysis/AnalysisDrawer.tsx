import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useDesignStore } from "@/store/designStore";
import { AnalysisContent } from "./AnalysisContent";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onToggle: () => void;
};

export function AnalysisDrawer({ open, onToggle }: Props) {
  const { analysisResult, analysisLoading } = useDesignStore();

  const scoreColor =
    !analysisResult ? "bg-gray-100 text-gray-500" :
    analysisResult.score >= 80 ? "bg-green-100 text-green-700" :
    analysisResult.score >= 60 ? "bg-amber-100 text-amber-700" :
    "bg-red-100 text-red-700";

  return (
    <div
      className={cn(
        "flex flex-col border-t border-gray-200 bg-white transition-all duration-300 overflow-hidden",
        open ? "h-80" : "h-11"
      )}
    >
      {/* Header strip */}
      <button
        onClick={onToggle}
        className="flex items-center gap-2 px-4 h-11 shrink-0 hover:bg-gray-50 transition-colors w-full text-left"
      >
        <Sparkles size={14} className="text-violet-500" />
        <span className="text-sm font-semibold text-gray-700">AI Analysis</span>
        {analysisResult && (
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full ml-1", scoreColor)}>
            {analysisResult.score}/100
          </span>
        )}
        {analysisLoading && (
          <span className="text-[10px] text-gray-400 animate-pulse ml-1">Analyzing…</span>
        )}
        <span className="ml-auto text-gray-400">
          {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
      </button>

      {/* Content */}
      {open && (
        <div className="flex-1 overflow-hidden">
          {!analysisResult && !analysisLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-400">Click "Analyze Design" to get AI-powered feedback</p>
            </div>
          ) : (
            <AnalysisContent />
          )}
        </div>
      )}
    </div>
  );
}

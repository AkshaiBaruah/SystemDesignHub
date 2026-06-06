import { useState } from "react";
import { Check, Loader2, AlertCircle, Share2, Sparkles, Undo2, Redo2, BookOpen, Activity } from "lucide-react";
import { useDesignStore } from "@/store/designStore";
import { useSimulationStore } from "@/store/simulationStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";

type Props = {
  onAnalyze: () => void;
  analysisLoading: boolean;
};

export function SyncToolbar({ onAnalyze, analysisLoading }: Props) {
  const { designName, syncStatus, setDesignName, undo, redo, canUndo, canRedo, createExampleDesign } = useDesignStore();
  const { toggleDrawer, isDrawerOpen, status: simStatus } = useSimulationStore();
  const [copied, setCopied] = useState(false);
  const [loadingExample, setLoadingExample] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLoadExample = async () => {
    setLoadingExample(true);
    try {
      await createExampleDesign();
    } finally {
      setLoadingExample(false);
    }
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg shadow-sm px-3 py-1.5">
        {/* Design name */}
        <Input
          value={designName}
          onChange={(e) => setDesignName(e.target.value)}
          className="h-7 text-sm font-medium border-0 shadow-none focus-visible:ring-0 w-44 px-1"
          placeholder="Untitled Design"
        />

        {/* Sync status */}
        <div className="flex items-center gap-1 text-xs min-w-[52px]">
          {syncStatus === "saving" && (
            <>
              <Loader2 size={12} className="animate-spin text-gray-400" />
              <span className="text-gray-400">Saving…</span>
            </>
          )}
          {syncStatus === "saved" && (
            <>
              <Check size={12} className="text-green-500" />
              <span className="text-green-600">Saved</span>
            </>
          )}
          {syncStatus === "error" && (
            <>
              <AlertCircle size={12} className="text-red-500" />
              <span className="text-red-600">Error</span>
            </>
          )}
          {syncStatus === "idle" && <span className="text-gray-300 text-[10px]">●</span>}
        </div>

        <div className="w-px h-4 bg-gray-200" />

        {/* Undo / Redo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={undo}
              disabled={!canUndo}
              className="h-7 w-7 p-0"
            >
              <Undo2 size={13} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Undo (⌘Z)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={redo}
              disabled={!canRedo}
              className="h-7 w-7 p-0"
            >
              <Redo2 size={13} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Redo (⌘⇧Z)</TooltipContent>
        </Tooltip>

        <div className="w-px h-4 bg-gray-200" />

        {/* Load Example */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadExample}
              disabled={loadingExample}
              className="h-7 px-2 text-xs gap-1 text-gray-600"
            >
              {loadingExample ? <Loader2 size={12} className="animate-spin" /> : <BookOpen size={12} />}
              Example
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Load Client → LB → API Gateway → Service → DB template</TooltipContent>
        </Tooltip>

        {/* Simulate toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isDrawerOpen && simStatus !== "idle" ? "default" : "ghost"}
              size="sm"
              onClick={toggleDrawer}
              className={`h-7 px-2 text-xs gap-1 ${
                simStatus === "running"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : simStatus === "paused"
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : ""
              }`}
            >
              <Activity size={12} className={simStatus === "running" ? "animate-pulse" : ""} />
              Simulate
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Configure and run load simulation</TooltipContent>
        </Tooltip>

        <Button variant="ghost" size="sm" onClick={handleShare} className="h-7 px-2 text-xs gap-1">
          <Share2 size={12} />
          {copied ? "Copied!" : "Share"}
        </Button>

        <Button
          size="sm"
          onClick={onAnalyze}
          disabled={analysisLoading}
          className="h-7 px-3 text-xs gap-1 bg-violet-600 hover:bg-violet-700"
        >
          {analysisLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          Analyze
        </Button>
      </div>
    </TooltipProvider>
  );
}

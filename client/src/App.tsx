import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useDesignStore } from "@/store/designStore";
import { useSimulationStore } from "@/store/simulationStore";
import { ComponentLibrary } from "@/components/library/ComponentLibrary";
import { DesignCanvas } from "@/components/canvas/DesignCanvas";
import { ConfigPanel } from "@/components/config/ConfigPanel";
import { AnalysisDrawer } from "@/components/analysis/AnalysisDrawer";
import { SimulationDrawer } from "@/components/simulation/SimulationDrawer";

export function App() {
  const { loadComponentDefs, createDesign, loadDesign, runAnalysis } = useDesignStore();
  const { isDrawerOpen, toggleDrawer } = useSimulationStore();
  const [analysisOpen, setAnalysisOpen] = useState(false);

  useEffect(() => {
    loadComponentDefs();

    const match = window.location.pathname.match(/^\/design\/([A-Za-z0-9_-]+)$/);
    if (match) {
      loadDesign(match[1]).catch(() => createDesign());
    } else {
      createDesign();
    }
  }, []);

  const handleAnalyze = async () => {
    setAnalysisOpen(true);
    await runAnalysis();
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left panel */}
        <div className="w-64 shrink-0 overflow-hidden">
          <ComponentLibrary />
        </div>

        {/* Center canvas */}
        <div className="flex-1 overflow-hidden relative">
          <ReactFlowProvider>
            <DesignCanvas
              onAnalysisOpen={handleAnalyze}
              setAnalysisDrawerOpen={setAnalysisOpen}
            />
          </ReactFlowProvider>
        </div>

        {/* Right panel */}
        <div className="w-72 shrink-0 overflow-hidden">
          <ConfigPanel />
        </div>
      </div>

      {/* Bottom drawers */}
      <AnalysisDrawer open={analysisOpen} onToggle={() => setAnalysisOpen((o) => !o)} />
      <SimulationDrawer open={isDrawerOpen} onToggle={toggleDrawer} />
    </div>
  );
}

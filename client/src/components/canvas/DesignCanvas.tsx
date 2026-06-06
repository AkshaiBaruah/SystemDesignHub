import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ConnectionLineType,
  type Connection,
  type Edge,
  type NodeChange,
  type EdgeChange,
  useReactFlow,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nanoid } from "nanoid";
import { useDesignStore } from "@/store/designStore";
import { ComponentNode } from "./ComponentNode";
import { SyncToolbar } from "./SyncToolbar";
import { validateDesign } from "@/lib/api";
import type { DesignNodeData } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const nodeTypes = { componentNode: ComponentNode };

type Props = {
  onAnalysisOpen: () => void;
  setAnalysisDrawerOpen: (open: boolean) => void;
};

export function DesignCanvas({ onAnalysisOpen, setAnalysisDrawerOpen }: Props) {
  const store = useDesignStore();
  const { screenToFlowPosition } = useReactFlow();
  const validatingRef = useRef(false);

  // Keyboard shortcuts: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z = redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        store.redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [store]);
  const [validationModal, setValidationModal] = useState<{
    errors: { nodeId: string; field: string; message: string }[];
    edgeErrors: { edgeId: string; message: string }[];
  } | null>(null);
  const [edgeLabelEdit, setEdgeLabelEdit] = useState<{ edgeId: string; label: string } | null>(null);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const componentId = e.dataTransfer.getData("componentId");
      if (!componentId) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      store.addNode(componentId, position);
    },
    [screenToFlowPosition, store]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (validatingRef.current) return;
      if (!store.designId) return;

      // Optimistically add edge, then validate
      const newEdge: Edge = {
        id: nanoid(8),
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        animated: true,
        type: "smoothstep",
        label: "",
      };

      // Temporarily add to check server-side validation
      // Build a quick local check first using componentDefs acceptsFrom
      const sourceNode = store.nodes.find((n) => n.id === connection.source);
      const targetNode = store.nodes.find((n) => n.id === connection.target);
      if (sourceNode && targetNode) {
        const targetDef = store.componentDefs.find((d) => d.id === (targetNode.data as DesignNodeData).defId);
        const sourceDef = store.componentDefs.find((d) => d.id === (sourceNode.data as DesignNodeData).defId);
        if (targetDef && sourceDef && !targetDef.acceptsFrom.includes(sourceDef.id)) {
          // Show inline error toast
          const event = new CustomEvent("edge-rejected", {
            detail: { message: `${targetDef.label} does not accept connections from ${sourceDef.label}` },
          });
          window.dispatchEvent(event);
          return;
        }
      }

      store.addEdge(newEdge);
    },
    [store]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Let React Flow handle visual changes, but filter deletions to our store
      const deletions = changes.filter((c) => c.type === "remove");
      for (const d of deletions) {
        if ("id" in d) store.deleteNode(d.id);
      }
      store.applyNodeChanges(changes as NodeChange<import("@xyflow/react").Node<DesignNodeData>>[]);
    },
    [store]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const deletions = changes.filter((c) => c.type === "remove");
      for (const d of deletions) {
        if ("id" in d) store.deleteEdge(d.id);
      }
      store.applyEdgeChanges(changes);
    },
    [store]
  );

  const onNodeDragStop = useCallback(
    (_e: unknown, node: import("@xyflow/react").Node) => {
      store.moveNode(node.id, node.position);
    },
    [store]
  );

  const onNodeClick = useCallback(
    (_e: unknown, node: import("@xyflow/react").Node) => {
      store.selectNode(node.id);
    },
    [store]
  );

  const onPaneClick = useCallback(() => {
    store.selectNode(null);
  }, [store]);

  const onEdgeDoubleClick = useCallback(
    (_e: React.MouseEvent, edge: Edge) => {
      setEdgeLabelEdit({ edgeId: edge.id, label: (edge.label as string) ?? "" });
    },
    []
  );

  const handleAnalyze = async () => {
    if (!store.designId) return;
    const result = await validateDesign(store.designId);
    if (!result.valid) {
      setValidationModal({ errors: result.errors, edgeErrors: result.edgeErrors });
      return;
    }
    setAnalysisDrawerOpen(true);
    onAnalysisOpen();
  };

  return (
    <div className="relative w-full h-full">
      <SyncToolbar onAnalyze={handleAnalyze} analysisLoading={store.analysisLoading} />

      <ReactFlow
        nodes={store.nodes}
        edges={store.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onDrop={onDrop}
        onDragOver={onDragOver}
        snapToGrid
        snapGrid={[20, 20]}
        connectionLineType={ConnectionLineType.SmoothStep}
        defaultEdgeOptions={{ animated: true, type: "smoothstep" }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode={["Backspace", "Delete"]}
        className="bg-gray-50"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
        <Controls className="!bottom-4 !left-4" />
        <MiniMap
          className="!bottom-4 !right-4"
          nodeColor={(node) => {
            const def = store.componentDefs.find((d) => d.id === (node.data as DesignNodeData).defId);
            const colorMap: Record<string, string> = {
              amber: "#f59e0b", blue: "#3b82f6", cyan: "#06b6d4",
              violet: "#8b5cf6", slate: "#64748b", orange: "#f97316", emerald: "#10b981",
            };
            return colorMap[def?.color ?? "slate"] ?? "#64748b";
          }}
        />
      </ReactFlow>

      {/* Edge label edit overlay */}
      {edgeLabelEdit && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="pointer-events-auto bg-white border border-gray-200 rounded-lg shadow-lg p-3 flex gap-2 items-center">
            <input
              autoFocus
              className="text-sm border border-gray-200 rounded px-2 py-1 w-40 focus:outline-none focus:ring-1 focus:ring-violet-400"
              value={edgeLabelEdit.label}
              onChange={(e) => setEdgeLabelEdit((s) => s ? { ...s, label: e.target.value } : null)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  store.updateEdgeLabel(edgeLabelEdit.edgeId, edgeLabelEdit.label);
                  setEdgeLabelEdit(null);
                }
                if (e.key === "Escape") setEdgeLabelEdit(null);
              }}
              placeholder="Edge label…"
            />
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                store.updateEdgeLabel(edgeLabelEdit.edgeId, edgeLabelEdit.label);
                setEdgeLabelEdit(null);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      )}

      {/* Validation error modal */}
      <Dialog open={!!validationModal} onOpenChange={() => setValidationModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Design has validation errors</DialogTitle>
            <DialogDescription>Fix the following issues before running AI analysis.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {validationModal?.errors.map((err, i) => (
              <div key={i} className="text-sm p-2 bg-red-50 rounded border border-red-200">
                <span className="font-medium text-red-700">Node {err.nodeId}:</span>{" "}
                <span className="text-red-600">{err.message}</span>
              </div>
            ))}
            {validationModal?.edgeErrors.map((err, i) => (
              <div key={i} className="text-sm p-2 bg-orange-50 rounded border border-orange-200">
                <span className="font-medium text-orange-700">Edge:</span>{" "}
                <span className="text-orange-600">{err.message}</span>
              </div>
            ))}
          </div>
          <Button onClick={() => setValidationModal(null)} className="w-full">Close</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

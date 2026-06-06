import { Settings } from "lucide-react";
import { useDesignStore } from "@/store/designStore";
import { NodeConfig } from "./NodeConfig";
import type { DesignNodeData } from "@/lib/types";
import type { Node } from "@xyflow/react";

export function ConfigPanel() {
  const { selectedNodeId, nodes } = useDesignStore();
  const selectedNode = selectedNodeId
    ? (nodes.find((n) => n.id === selectedNodeId) as Node<DesignNodeData> | undefined)
    : undefined;

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {selectedNode ? (
        <NodeConfig node={selectedNode} />
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <Settings size={18} className="text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">Select a component</p>
          <p className="text-xs text-gray-400 mt-1">Click any node on the canvas to configure it</p>
        </div>
      )}
    </div>
  );
}

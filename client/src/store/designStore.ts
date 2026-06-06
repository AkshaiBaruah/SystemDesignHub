import { create } from "zustand";
import { type Node, type Edge, applyNodeChanges, applyEdgeChanges, type NodeChange, type EdgeChange, type XYPosition } from "@xyflow/react";
import { nanoid } from "nanoid";
import type { ComponentDef, DesignNodeData, DesignEdge, AnalysisResult, ValidationResult } from "@/lib/types";
import * as api from "@/lib/api";

export type SyncStatus = "idle" | "saving" | "saved" | "error";

type Snapshot = { nodes: Node<DesignNodeData>[]; edges: Edge[] };

const MAX_HISTORY = 50;

interface DesignStore {
  // Component definitions (fetched once)
  componentDefs: ComponentDef[];
  componentDefsLoading: boolean;

  // Design identity
  designId: string | null;
  designName: string;

  // Canvas state (React Flow)
  nodes: Node<DesignNodeData>[];
  edges: Edge[];

  // Undo / redo
  past: Snapshot[];
  future: Snapshot[];
  canUndo: boolean;
  canRedo: boolean;

  // Sync
  syncStatus: SyncStatus;
  lastSyncedAt: Date | null;

  // Selection
  selectedNodeId: string | null;

  // Analysis
  analysisResult: AnalysisResult | null;
  analysisLoading: boolean;
  analysisError: string | null;

  // Actions
  loadComponentDefs: () => Promise<void>;
  createDesign: () => Promise<void>;
  createExampleDesign: () => Promise<void>;
  loadDesign: (id: string) => Promise<void>;
  addNode: (defId: string, position: XYPosition) => void;
  moveNode: (nodeId: string, position: XYPosition) => void;
  updateNodeParam: (nodeId: string, key: string, value: unknown) => void;
  deleteNode: (nodeId: string) => void;
  addEdge: (edge: Edge) => void;
  updateEdgeLabel: (edgeId: string, label: string) => void;
  deleteEdge: (edgeId: string) => void;
  selectNode: (id: string | null) => void;
  setDesignName: (name: string) => void;
  applyNodeChanges: (changes: NodeChange<Node<DesignNodeData>>[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  syncToBackend: () => Promise<void>;
  validate: () => Promise<ValidationResult>;
  runAnalysis: () => Promise<void>;
  undo: () => void;
  redo: () => void;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
// Throttle param-change snapshots so fast typing doesn't flood history
let lastParamSnapshotTime = 0;

function scheduleSync(get: () => DesignStore) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => get().syncToBackend(), 1500);
}

function immediateSync(get: () => DesignStore) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  get().syncToBackend();
}

export const useDesignStore = create<DesignStore>((set, get) => ({
  componentDefs: [],
  componentDefsLoading: false,
  designId: null,
  designName: "Untitled Design",
  nodes: [],
  edges: [],
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,
  syncStatus: "idle",
  lastSyncedAt: null,
  selectedNodeId: null,
  analysisResult: null,
  analysisLoading: false,
  analysisError: null,

  loadComponentDefs: async () => {
    set({ componentDefsLoading: true });
    try {
      const defs = await api.fetchComponents();
      set({ componentDefs: defs, componentDefsLoading: false });
    } catch {
      set({ componentDefsLoading: false });
    }
  },

  createDesign: async () => {
    const { id } = await api.createDesign();
    set({ designId: id, designName: "Untitled Design", nodes: [], edges: [], past: [], future: [], canUndo: false, canRedo: false });
    window.history.pushState({}, "", `/design/${id}`);
  },

  createExampleDesign: async () => {
    const { id } = await api.createExampleDesign();
    await get().loadDesign(id);
    window.history.pushState({}, "", `/design/${id}`);
  },

  loadDesign: async (id: string) => {
    const design = await api.fetchDesign(id);
    const canvas = design.canvasJson ?? { nodes: [], edges: [] };
    set({
      designId: id,
      designName: design.name,
      nodes: (canvas.nodes ?? []) as Node<DesignNodeData>[],
      edges: (canvas.edges ?? []) as Edge[],
      past: [],
      future: [],
      canUndo: false,
      canRedo: false,
    });
  },

  // ─── History helpers ──────────────────────────────────────────────────────

  undo: () => {
    const { past, nodes, edges } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set((s) => ({
      past: s.past.slice(0, -1),
      future: [{ nodes: s.nodes, edges: s.edges }, ...s.future].slice(0, MAX_HISTORY),
      nodes: prev.nodes,
      edges: prev.edges,
      canUndo: past.length > 1,
      canRedo: true,
    }));
    // sync debounced — don't thrash while Ctrl+Z held
    scheduleSync(get);
    void nodes; void edges; // used above via closure
  },

  redo: () => {
    const { future } = get();
    if (future.length === 0) return;
    const next = future[0];
    set((s) => ({
      future: s.future.slice(1),
      past: [...s.past, { nodes: s.nodes, edges: s.edges }].slice(-MAX_HISTORY),
      nodes: next.nodes,
      edges: next.edges,
      canUndo: true,
      canRedo: future.length > 1,
    }));
    scheduleSync(get);
  },

  // ─── Canvas mutations ──────────────────────────────────────────────────────

  addNode: (defId: string, position: XYPosition) => {
    const { componentDefs, nodes, edges } = get();
    const def = componentDefs.find((d) => d.id === defId);
    if (!def) return;

    const defaultParams: Record<string, unknown> = {};
    for (const p of def.params) {
      defaultParams[p.key] = p.default;
    }

    const newNode: Node<DesignNodeData> = {
      id: nanoid(8),
      type: "componentNode",
      position,
      data: { defId, label: def.label, params: defaultParams },
    };

    set((s) => ({
      past: [...s.past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      canUndo: true,
      canRedo: false,
      nodes: [...s.nodes, newNode],
    }));
    immediateSync(get);
  },

  moveNode: (nodeId: string, position: XYPosition) => {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
    }));
    scheduleSync(get);
  },

  updateNodeParam: (nodeId: string, key: string, value: unknown) => {
    const now = Date.now();
    set((s) => {
      // Snapshot at most once per second during rapid edits
      const shouldSnapshot = now - lastParamSnapshotTime > 1000;
      if (shouldSnapshot) lastParamSnapshotTime = now;
      return {
        past: shouldSnapshot ? [...s.past, { nodes: s.nodes, edges: s.edges }].slice(-MAX_HISTORY) : s.past,
        future: shouldSnapshot ? [] : s.future,
        canUndo: shouldSnapshot ? true : s.canUndo,
        canRedo: shouldSnapshot ? false : s.canRedo,
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, params: { ...n.data.params, [key]: value } } } : n
        ),
      };
    });
    scheduleSync(get);
  },

  deleteNode: (nodeId: string) => {
    const { nodes, edges } = get();
    set((s) => ({
      past: [...s.past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      canUndo: true,
      canRedo: false,
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: s.selectedNodeId === nodeId ? null : s.selectedNodeId,
    }));
    immediateSync(get);
  },

  addEdge: (edge: Edge) => {
    const { nodes, edges } = get();
    const animatedEdge = { ...edge, animated: true, type: "smoothstep" };
    set((s) => ({
      past: [...s.past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      canUndo: true,
      canRedo: false,
      edges: [...s.edges, animatedEdge],
    }));
    immediateSync(get);
  },

  updateEdgeLabel: (edgeId: string, label: string) => {
    set((s) => ({
      edges: s.edges.map((e) => (e.id === edgeId ? { ...e, label } : e)),
    }));
    scheduleSync(get);
  },

  deleteEdge: (edgeId: string) => {
    const { nodes, edges } = get();
    set((s) => ({
      past: [...s.past, { nodes, edges }].slice(-MAX_HISTORY),
      future: [],
      canUndo: true,
      canRedo: false,
      edges: s.edges.filter((e) => e.id !== edgeId),
    }));
    immediateSync(get);
  },

  selectNode: (id: string | null) => {
    set({ selectedNodeId: id });
  },

  setDesignName: (name: string) => {
    set({ designName: name });
    scheduleSync(get);
  },

  applyNodeChanges: (changes: NodeChange<Node<DesignNodeData>>[]) => {
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) }));
  },

  applyEdgeChanges: (changes: EdgeChange[]) => {
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }));
  },

  syncToBackend: async () => {
    const { designId, designName, nodes, edges } = get();
    if (!designId) return;

    set({ syncStatus: "saving" });
    try {
      await api.patchDesign(designId, {
        name: designName,
        canvas: { nodes: nodes as unknown[], edges: edges as unknown[] },
      });
      set({ syncStatus: "saved", lastSyncedAt: new Date() });
      setTimeout(() => set((s) => (s.syncStatus === "saved" ? { syncStatus: "idle" } : s)), 2000);
    } catch {
      set({ syncStatus: "error" });
    }
  },

  validate: async () => {
    const { designId } = get();
    if (!designId) return { valid: false, errors: [], edgeErrors: [] };
    return api.validateDesign(designId);
  },

  runAnalysis: async () => {
    const { designId } = get();
    if (!designId) return;

    set({ analysisLoading: true, analysisError: null });
    try {
      const result = await api.analyzeDesign(designId);
      set({ analysisResult: result, analysisLoading: false });
    } catch (err) {
      set({ analysisError: (err as Error).message, analysisLoading: false });
    }
  },
}));

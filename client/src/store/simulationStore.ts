import { create } from "zustand";
import { nanoid } from "nanoid";
import type { Node, Edge } from "@xyflow/react";
import type { DesignNodeData } from "@/lib/types";
import type { ApiDef, CacheInteraction, DbInteraction, NodeMetrics, SimStatus, ApiBreakdown } from "@/simulation/types";
import { tickSimulation } from "@/simulation/engine";

interface SimulationStore {
  status: SimStatus;
  concurrentUsers: number;
  apis: ApiDef[];
  metrics: Record<string, NodeMetrics>;
  apiBreakdown: ApiBreakdown[];
  elapsed: number;
  isDrawerOpen: boolean;

  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  setConcurrentUsers: (n: number) => void;

  // API CRUD
  addApi: (partial?: Partial<Omit<ApiDef, "id" | "cacheInteractions" | "dbInteractions">>) => void;
  updateApi: (id: string, patch: Partial<ApiDef>) => void;
  removeApi: (id: string) => void;

  // Cache interaction CRUD
  addCacheInteraction: (apiId: string, nodeId: string, operation: "read" | "write") => void;
  updateCacheInteraction: (apiId: string, id: string, patch: Partial<CacheInteraction>) => void;
  removeCacheInteraction: (apiId: string, id: string) => void;

  // DB interaction CRUD
  addDbInteraction: (apiId: string, nodeId: string) => void;
  updateDbInteraction: (apiId: string, id: string, patch: Partial<DbInteraction>) => void;
  removeDbInteraction: (apiId: string, id: string) => void;

  // Simulation control
  start: (nodes: Node<DesignNodeData>[], edges: Edge[]) => void;
  pause: () => void;
  resume: (nodes: Node<DesignNodeData>[], edges: Edge[]) => void;
  stop: () => void;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

function clearTick() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  status: "idle",
  concurrentUsers: 1000,
  elapsed: 0,
  metrics: {},
  apiBreakdown: [],
  isDrawerOpen: false,
  apis: [
    {
      id: nanoid(6),
      name: "Read Posts",
      method: "GET",
      weight: 70,
      cacheInteractions: [],
      dbInteractions: [],
    },
    {
      id: nanoid(6),
      name: "Create Post",
      method: "POST",
      weight: 30,
      cacheInteractions: [],
      dbInteractions: [],
    },
  ],

  openDrawer: () => set({ isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),
  toggleDrawer: () => set((s) => ({ isDrawerOpen: !s.isDrawerOpen })),
  setConcurrentUsers: (n) => set({ concurrentUsers: n }),

  addApi: (partial) =>
    set((s) => ({
      apis: [
        ...s.apis,
        {
          id: nanoid(6),
          name: partial?.name ?? "New API",
          method: partial?.method ?? "GET",
          weight: partial?.weight ?? 50,
          cacheInteractions: [],
          dbInteractions: [],
        },
      ],
    })),

  updateApi: (id, patch) =>
    set((s) => ({ apis: s.apis.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),

  removeApi: (id) =>
    set((s) => ({ apis: s.apis.filter((a) => a.id !== id) })),

  addCacheInteraction: (apiId, nodeId, operation) =>
    set((s) => ({
      apis: s.apis.map((a) =>
        a.id !== apiId
          ? a
          : {
              ...a,
              cacheInteractions: [
                ...a.cacheInteractions,
                {
                  id: nanoid(6),
                  operation,
                  nodeId,
                  keyPattern: "",
                  ttlSeconds: 300,
                  fanoutFactor: 1,
                  uniqueKeys: 10000,
                  targetHitRatePct: 80,
                },
              ],
            }
      ),
    })),

  updateCacheInteraction: (apiId, id, patch) =>
    set((s) => ({
      apis: s.apis.map((a) =>
        a.id !== apiId
          ? a
          : {
              ...a,
              cacheInteractions: a.cacheInteractions.map((c) =>
                c.id === id ? { ...c, ...patch } : c
              ),
            }
      ),
    })),

  removeCacheInteraction: (apiId, id) =>
    set((s) => ({
      apis: s.apis.map((a) =>
        a.id !== apiId
          ? a
          : { ...a, cacheInteractions: a.cacheInteractions.filter((c) => c.id !== id) }
      ),
    })),

  addDbInteraction: (apiId, nodeId) =>
    set((s) => ({
      apis: s.apis.map((a) =>
        a.id !== apiId
          ? a
          : {
              ...a,
              dbInteractions: [
                ...a.dbInteractions,
                {
                  id: nanoid(6),
                  nodeId,
                  queriesPerRequest: 1,
                  readFraction: 0.8,
                  cacheFallthrough: false,
                },
              ],
            }
      ),
    })),

  updateDbInteraction: (apiId, id, patch) =>
    set((s) => ({
      apis: s.apis.map((a) =>
        a.id !== apiId
          ? a
          : {
              ...a,
              dbInteractions: a.dbInteractions.map((d) =>
                d.id === id ? { ...d, ...patch } : d
              ),
            }
      ),
    })),

  removeDbInteraction: (apiId, id) =>
    set((s) => ({
      apis: s.apis.map((a) =>
        a.id !== apiId
          ? a
          : { ...a, dbInteractions: a.dbInteractions.filter((d) => d.id !== id) }
      ),
    })),

  start: (nodes, edges) => {
    clearTick();
    set({ status: "running", elapsed: 0, metrics: {}, apiBreakdown: [] });
    intervalId = setInterval(() => {
      set((s) => {
        const newElapsed = s.elapsed + 1;
        const { nodeMetrics, apiBreakdown } = tickSimulation(
          nodes, edges, s.apis, s.concurrentUsers, newElapsed, s.metrics
        );
        return { elapsed: newElapsed, metrics: nodeMetrics, apiBreakdown };
      });
    }, 1000);
  },

  pause: () => {
    clearTick();
    set({ status: "paused" });
  },

  resume: (nodes, edges) => {
    clearTick();
    set({ status: "running" });
    intervalId = setInterval(() => {
      set((s) => {
        const newElapsed = s.elapsed + 1;
        const { nodeMetrics, apiBreakdown } = tickSimulation(
          nodes, edges, s.apis, s.concurrentUsers, newElapsed, s.metrics
        );
        return { elapsed: newElapsed, metrics: nodeMetrics, apiBreakdown };
      });
    }, 1000);
  },

  stop: () => {
    clearTick();
    set({ status: "idle", elapsed: 0, metrics: {}, apiBreakdown: [] });
  },
}));

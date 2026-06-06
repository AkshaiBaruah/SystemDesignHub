import { pgTable, text, jsonb, timestamp, serial } from "drizzle-orm/pg-core";

export const components = pgTable("components", {
  id: text("id").primaryKey(),
  category: text("category").notNull(),
  label: text("label").notNull(),
  color: text("color").notNull(),
  icon: text("icon").notNull(),
  description: text("description").notNull(),
  params: jsonb("params").notNull().$type<Param[]>(),
  cardSummary: text("card_summary").array().notNull(),
  acceptsFrom: text("accepts_from").array().notNull(),
});

export const designs = pgTable("designs", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("Untitled Design"),
  canvasJson: jsonb("canvas_json")
    .notNull()
    .$type<{ nodes: DesignNode[]; edges: DesignEdge[] }>()
    .default({ nodes: [], edges: [] }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const analyses = pgTable("analyses", {
  id: serial("id").primaryKey(),
  designId: text("design_id")
    .notNull()
    .references(() => designs.id, { onDelete: "cascade" }),
  resultJson: jsonb("result_json").notNull().$type<AnalysisResult>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Types that mirror the DB jsonb columns
export type Param = {
  key: string;
  label: string;
  type: "int" | "enum" | "bool" | "text" | "text[]" | "textarea";
  options?: string[];
  range?: [number, number];
  default: unknown;
  required?: boolean;
  hint?: string;
  showWhen?: { key: string; value: unknown };
};

export type ComponentDef = typeof components.$inferSelect;

export type DesignNode = {
  id: string;
  type: "componentNode";
  position: { x: number; y: number };
  data: {
    defId: string;
    label: string;
    params: Record<string, unknown>;
  };
};

export type DesignEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
};

export type AnalysisResult = {
  score: number;
  score_rationale: string;
  spofs: { node_id: string; issue: string; fix: string }[];
  warnings: { node_id: string; param: string; issue: string; recommended_value: string }[];
  bottlenecks: { component: string; reason: string; severity: "low" | "medium" | "high" }[];
  missing_components: { component_type: string; reason: string }[];
  suggestions: { title: string; detail: string; affected_nodes: string[] }[];
  summary: string;
};

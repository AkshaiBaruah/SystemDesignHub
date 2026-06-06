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

export type ComponentDef = {
  id: string;
  category: string;
  label: string;
  color: string;
  icon: string;
  description: string;
  params: Param[];
  cardSummary: string[];
  acceptsFrom: string[];
};

export type DesignNodeData = {
  defId: string;
  label: string;
  params: Record<string, unknown>;
};

export type DesignEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
};

export type Design = {
  id: string;
  name: string;
  canvasJson: { nodes: import("@xyflow/react").Node<DesignNodeData>[]; edges: DesignEdge[] };
  createdAt: string;
  updatedAt: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: { nodeId: string; field: string; message: string }[];
  edgeErrors: { edgeId: string; message: string }[];
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

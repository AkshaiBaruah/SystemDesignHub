import { Router } from "express";
import { db } from "../db/index.js";
import { components, designs } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { ValidateSchema } from "../lib/validation.js";
import type { Param, DesignNode, DesignEdge } from "../db/schema.js";

export type ValidationResult = {
  valid: boolean;
  errors: { nodeId: string; field: string; message: string }[];
  edgeErrors: { edgeId: string; message: string }[];
};

export async function runValidation(designId: string): Promise<ValidationResult> {
  const [design] = await db.select().from(designs).where(eq(designs.id, designId));
  if (!design) throw new Error("Design not found");

  const canvas = design.canvasJson as { nodes: DesignNode[]; edges: DesignEdge[] };
  const nodeList = canvas.nodes ?? [];
  const edgeList = canvas.edges ?? [];

  const errors: ValidationResult["errors"] = [];
  const edgeErrors: ValidationResult["edgeErrors"] = [];

  if (nodeList.length === 0) {
    return { valid: true, errors: [], edgeErrors: [] };
  }

  // Fetch all referenced component defs
  const defIds = [...new Set(nodeList.map((n) => n.data.defId))];
  const compRows = await db.select().from(components).where(inArray(components.id, defIds));
  const compMap = new Map(compRows.map((c) => [c.id, c]));

  // Required field check
  for (const node of nodeList) {
    const def = compMap.get(node.data.defId);
    if (!def) continue;
    const params = def.params as Param[];
    for (const param of params) {
      if (!param.required) continue;
      const val = node.data.params[param.key];
      const isEmpty =
        val === undefined ||
        val === null ||
        val === "" ||
        (Array.isArray(val) && val.length === 0);
      if (isEmpty) {
        errors.push({ nodeId: node.id, field: param.key, message: `${param.label} is required` });
      }
    }
  }

  // Connection validation
  const nodeById = new Map(nodeList.map((n) => [n.id, n]));
  for (const edge of edgeList) {
    const sourceNode = nodeById.get(edge.source);
    const targetNode = nodeById.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const targetDef = compMap.get(targetNode.data.defId);
    if (!targetDef) continue;

    const acceptsFrom = targetDef.acceptsFrom as string[];
    if (!acceptsFrom.includes(sourceNode.data.defId)) {
      const sourceDef = compMap.get(sourceNode.data.defId);
      edgeErrors.push({
        edgeId: edge.id,
        message: `${targetDef.label} does not accept connections from ${sourceDef?.label ?? sourceNode.data.defId}`,
      });
    }
  }

  return { valid: errors.length === 0 && edgeErrors.length === 0, errors, edgeErrors };
}

const router = Router();

router.post("/", async (req, res) => {
  const parsed = ValidateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await runValidation(parsed.data.designId);
    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Design not found") {
      res.status(404).json({ error: "Design not found" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Validation failed" });
  }
});

export default router;

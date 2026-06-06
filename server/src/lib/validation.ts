import { z } from "zod";

export const DesignNodeSchema = z.object({
  id: z.string(),
  type: z.literal("componentNode"),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.object({
    defId: z.string(),
    label: z.string(),
    params: z.record(z.unknown()),
  }),
});

export const DesignEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  animated: z.boolean().optional(),
});

export const CanvasSchema = z.object({
  nodes: z.array(DesignNodeSchema),
  edges: z.array(DesignEdgeSchema),
});

export const PatchDesignSchema = z.object({
  name: z.string().optional(),
  canvas: CanvasSchema.optional(),
});

export const ValidateSchema = z.object({
  designId: z.string(),
});

export const AnalyzeSchema = z.object({
  designId: z.string(),
});

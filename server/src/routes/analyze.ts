import { Router } from "express";
import { db } from "../db/index.js";
import { components, designs, analyses } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { AnalyzeSchema } from "../lib/validation.js";
import { anthropic } from "../lib/anthropic.js";
import { runValidation } from "./validate.js";
import type { DesignNode, DesignEdge, Param } from "../db/schema.js";

const SYSTEM_PROMPT = `You are a senior distributed systems architect conducting a code-review-style
analysis of a system design. You will receive a JSON representation of the design.

First, use web_search to retrieve relevant best practices and failure patterns
from https://www.hellointerview.com/learn/system-design/in-a-hurry/core-concepts
and https://www.hellointerview.com/learn/system-design/in-a-hurry/delivery-framework

Then analyze the design and respond ONLY with a JSON object matching this exact
schema (no markdown, no prose outside the JSON):

{
  "score": number,
  "score_rationale": string,
  "spofs": [
    { "node_id": string, "issue": string, "fix": string }
  ],
  "warnings": [
    { "node_id": string, "param": string, "issue": string, "recommended_value": string }
  ],
  "bottlenecks": [
    { "component": string, "reason": string, "severity": "low"|"medium"|"high" }
  ],
  "missing_components": [
    { "component_type": string, "reason": string }
  ],
  "suggestions": [
    { "title": string, "detail": string, "affected_nodes": string[] }
  ],
  "summary": string
}

Rules:
- Reference specific node IDs and param names from the input
- Flag replication_factor < 2 on Kafka as a critical SPOF
- Flag no cache in front of any database serving >1 Service node
- Flag missing load balancer if multiple Service nodes exist
- Flag Cassandra consistency_level=ONE with replication_factor=1 as data loss risk
- Flag DynamoDB Provisioned mode with RCU/WCU < 100 as likely under-provisioned
- Suggest read replicas if PostgreSQL/MySQL has 0 replicas and >1 consumer
- Always check if there is a CDN for static content if the design seems user-facing`;

const router = Router();

router.post("/", async (req, res) => {
  const parsed = AnalyzeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { designId } = parsed.data;

  try {
    // Validate first
    const validation = await runValidation(designId);
    if (!validation.valid) {
      res.status(422).json({ error: "Design has validation errors", validation });
      return;
    }

    // Fetch design from DB (source of truth)
    const [design] = await db.select().from(designs).where(eq(designs.id, designId));
    if (!design) {
      res.status(404).json({ error: "Design not found" });
      return;
    }

    const canvas = design.canvasJson as { nodes: DesignNode[]; edges: DesignEdge[] };
    const nodeList = canvas.nodes ?? [];
    const edgeList = canvas.edges ?? [];

    // Fetch component defs for rich context
    const defIds = [...new Set(nodeList.map((n) => n.data.defId))];
    const compRows = defIds.length > 0
      ? await db.select().from(components).where(inArray(components.id, defIds))
      : [];
    const compMap = new Map(compRows.map((c) => [c.id, c]));

    // Build human-readable design description
    const nodeDescriptions = nodeList.map((n) => {
      const def = compMap.get(n.data.defId);
      const paramSummary = def
        ? (def.params as Param[])
            .map((p) => `${p.key}=${JSON.stringify(n.data.params[p.key] ?? p.default)}`)
            .join(", ")
        : JSON.stringify(n.data.params);
      return `- Node ${n.id} [${def?.label ?? n.data.defId}] (${def?.category ?? "unknown"}): ${paramSummary}`;
    });

    const edgeDescriptions = edgeList.map((e) => {
      const src = nodeList.find((n) => n.id === e.source);
      const tgt = nodeList.find((n) => n.id === e.target);
      const srcLabel = src ? (compMap.get(src.data.defId)?.label ?? src.data.defId) : e.source;
      const tgtLabel = tgt ? (compMap.get(tgt.data.defId)?.label ?? tgt.data.defId) : e.target;
      return `- ${srcLabel} (${e.source}) → ${tgtLabel} (${e.target})${e.label ? ` [${e.label}]` : ""}`;
    });

    const designContext = [
      `Design ID: ${designId}`,
      `Design Name: ${design.name}`,
      "",
      "Components:",
      ...nodeDescriptions,
      "",
      "Connections:",
      ...edgeDescriptions,
    ].join("\n");

    // Call Anthropic
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ type: "web_search_20250305", name: "web_search" }] as any,
      messages: [{ role: "user", content: designContext }],
    });

    // Extract JSON from response
    let analysisJson: string | null = null;
    for (const block of message.content) {
      if (block.type === "text") {
        // Strip any accidental markdown code fences
        const stripped = block.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        try {
          JSON.parse(stripped);
          analysisJson = stripped;
          break;
        } catch {
          // Try extracting JSON from within the text
          const match = block.text.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              JSON.parse(match[0]);
              analysisJson = match[0];
              break;
            } catch {
              // continue
            }
          }
        }
      }
    }

    if (!analysisJson) {
      res.status(502).json({ error: "AI returned no valid JSON" });
      return;
    }

    const result = JSON.parse(analysisJson);

    // Persist analysis
    await db.insert(analyses).values({ designId, resultJson: result });

    res.json(result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Design not found") {
      res.status(404).json({ error: "Design not found" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Analysis failed" });
  }
});

export default router;

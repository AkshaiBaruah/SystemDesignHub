import { Router } from "express";
import { db } from "../db/index.js";
import { designs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { PatchDesignSchema } from "../lib/validation.js";

function buildExampleCanvas() {
  const clientId = nanoid(8);
  const gwId = nanoid(8);
  const lbId = nanoid(8);
  const svcId = nanoid(8);
  const dbId = nanoid(8);
  return {
    name: "Example: Client → API Gateway → Service → DB",
    canvas: {
      nodes: [
        {
          id: clientId, type: "componentNode",
          position: { x: 80, y: 220 },
          data: { defId: "client", label: "Client", params: { client_type: "Browser" } },
        },
        {
          id: lbId, type: "componentNode",
          position: { x: 320, y: 220 },
          data: {
            defId: "loadbalancer", label: "Load Balancer",
            params: { type: "ALB (L7)", algorithm: "Round Robin", health_check_interval_sec: 30, ssl_termination: true, sticky_sessions: false },
          },
        },
        {
          id: gwId, type: "componentNode",
          position: { x: 560, y: 220 },
          data: {
            defId: "apigateway", label: "API Gateway",
            params: { rate_limit_rps: 10000, auth: "JWT", caching: false, cache_ttl_sec: 300, waf_enabled: true },
          },
        },
        {
          id: svcId, type: "componentNode",
          position: { x: 800, y: 220 },
          data: {
            defId: "service", label: "Service / Microservice",
            params: { instances: 3, cpu_cores: 2, memory_gb: 4, language: "Go", autoscaling: true, responsibilities: "Handles business logic and data access for the application domain." },
          },
        },
        {
          id: dbId, type: "componentNode",
          position: { x: 1040, y: 220 },
          data: {
            defId: "postgresql", label: "PostgreSQL",
            params: {
              read_replicas: 2, sharding: "None", connection_pool_size: 100,
              indexes: ["users_email_idx"], extensions: ["uuid-ossp"],
              table_schema: "CREATE TABLE users (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n  email TEXT UNIQUE NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);",
            },
          },
        },
      ],
      edges: [
        { id: nanoid(8), source: clientId, target: lbId, animated: true, type: "smoothstep", label: "HTTPS" },
        { id: nanoid(8), source: lbId, target: gwId, animated: true, type: "smoothstep", label: "" },
        { id: nanoid(8), source: gwId, target: svcId, animated: true, type: "smoothstep", label: "REST" },
        { id: nanoid(8), source: svcId, target: dbId, animated: true, type: "smoothstep", label: "SQL" },
      ],
    },
  };
}

const router = Router();

router.post("/from-template", async (req, res) => {
  try {
    const { name, canvas } = buildExampleCanvas();
    const id = nanoid(8);
    const [design] = await db
      .insert(designs)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .values({ id, name, canvasJson: canvas as any })
      .returning();
    res.status(201).json({ id: design.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create example design" });
  }
});

router.post("/", async (req, res) => {
  try {
    const id = nanoid(8);
    const [design] = await db
      .insert(designs)
      .values({ id, name: "Untitled Design", canvasJson: { nodes: [], edges: [] } })
      .returning();

    const origin = req.get("origin") ?? `http://localhost:${process.env.PORT ?? 3001}`;
    res.status(201).json({ id: design.id, shareUrl: `${origin}/design/${design.id}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create design" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [design] = await db
      .select()
      .from(designs)
      .where(eq(designs.id, req.params.id));

    if (!design) {
      res.status(404).json({ error: "Design not found" });
      return;
    }
    res.json(design);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch design" });
  }
});

router.patch("/:id", async (req, res) => {
  const parsed = PatchDesignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const { name, canvas } = parsed.data;

    // Build typed partial update
    type DesignUpdate = { updatedAt: Date; name?: string; canvasJson?: typeof canvas };
    const updates: DesignUpdate = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (canvas !== undefined) updates.canvasJson = canvas;

    const [updated] = await db
      .update(designs)
      .set(updates)
      .where(eq(designs.id, req.params.id))
      .returning({ updatedAt: designs.updatedAt });

    if (!updated) {
      res.status(404).json({ error: "Design not found" });
      return;
    }
    res.json({ updatedAt: updated.updatedAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update design" });
  }
});

export default router;

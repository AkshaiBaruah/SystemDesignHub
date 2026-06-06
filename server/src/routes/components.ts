import { Router } from "express";
import { db } from "../db/index.js";
import { components } from "../db/schema.js";
import { asc } from "drizzle-orm";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(components)
      .orderBy(asc(components.category), asc(components.label));

    res.set("Cache-Control", "public, max-age=300");
    res.json({ components: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch components" });
  }
});

export default router;

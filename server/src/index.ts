import "dotenv/config";
import express from "express";
import cors from "cors";
import componentsRouter from "./routes/components.js";
import designsRouter from "./routes/designs.js";
import validateRouter from "./routes/validate.js";
import analyzeRouter from "./routes/analyze.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "2mb" }));

app.use("/api/components", componentsRouter);
app.use("/api/designs", designsRouter);
app.use("/api/validate", validateRouter);
app.use("/api/analyze", analyzeRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

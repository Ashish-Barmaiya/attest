import "dotenv/config";
import { initDb } from "../db/schema.js";
import express from "express";
import { IngestEventSchema } from "./schemas.js";
import { appendEventPersistent } from "../db/appendPersistent.js";

const app = express();

app.use(express.json({ limit: "100kb" }));

app.post("/events", async (req, res) => {
  const parsed = IngestEventSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid event payload",
      details: parsed.error.flatten(),
    });
  }

  try {
    const event = await appendEventPersistent(parsed.data);

    res.status(201).json({
      sequence: event.sequence,
      chainHash: event.chainHash,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to append event" });
  }
});

// Initialize DB then start server
initDb()
  .then(() => {
    app.listen(3000, () => {
      console.log("Audit service listening on :3000");
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });

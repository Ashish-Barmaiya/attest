import "dotenv/config";
import { app } from "./app.js";
import { initDb } from "../db/schema.js";

initDb()
  .then(() => {
    const port = parseInt(process.env.PORT || "3000", 10);
    app.listen(port, () => {
      console.log(`Audit service listening on :${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });

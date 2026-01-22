import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mode = process.env.ANCHOR_MODE || "dev";

console.log(`[Anchor] Mode: ${mode}`);

let scriptToRun;
if (mode === "prod") {
  scriptToRun = path.join(__dirname, "run-anchor-prod.ts");
} else {
  scriptToRun = path.join(__dirname, "run-anchor-dev.ts");
}

console.log(`[Anchor] Executing: ${scriptToRun}`);

const result = spawnSync("tsx", [scriptToRun], {
  stdio: "inherit",
  env: process.env,
  shell: true, // needed for windows sometimes, or just to be safe with tsx
});

process.exit(result.status ?? 1);

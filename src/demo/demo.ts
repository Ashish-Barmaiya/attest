import "../db/schema.js";
import { appendEventPersistent } from "../db/appendPersistent.js";
import { loadAllEvents } from "../db/loadAll.js";
import { verifyChain } from "../core/verify.js";

appendEventPersistent({
  action: "ASSET_ADDED",
  actor: { type: "user", id: "u1" },
  resource: { type: "vault", id: "v1" },
});

appendEventPersistent({
  action: "ASSET_REMOVED",
  actor: { type: "user", id: "u1" },
  resource: { type: "vault", id: "v1" },
});

const events = loadAllEvents();

console.log("Verifying persisted chain...");
verifyChain(events);
console.log("OK");

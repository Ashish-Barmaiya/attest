import { appendEvent } from "../core/append.js";
import { verifyChain } from "../core/verify.js";

let chain: any[] = [];
let headHash = "GENESIS";

for (let i = 1; i <= 5; i++) {
  const event = appendEvent(headHash, i, {
    action: "TEST_EVENT",
    actor: { type: "user", id: "u1" },
    resource: { type: "vault", id: "v1" },
  });

  chain.push(event);
  headHash = event.chainHash;
}

console.log("Verifying clean chain...");
verifyChain(chain);
console.log("OK");

// Tamper
chain[4].payload.action = "HACKED";

console.log("Verifying tampered chain...");
verifyChain(chain);

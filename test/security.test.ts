import { prisma } from "../src/db/database.js";
import { hash, canonicalize } from "../src/core/hash.js";
import { verifyChain } from "../src/core/verify.js";
import { loadAllEvents } from "../src/db/loadAll.js";

describe("Cryptographic Integrity & Tamper Detection", () => {
  const PROJECT_ID = "attack-sim-project";

  beforeAll(async () => {
    await prisma.project.deleteMany({ where: { id: PROJECT_ID } });
    await prisma.project.create({
      data: {
        id: PROJECT_ID,
        name: "Attack Target",
        createdAt: BigInt(Date.now()),
      },
    });
    await prisma.chainHead.create({
      data: {
        projectId: PROJECT_ID,
        lastSequence: 0,
        lastChainHash: "GENESIS",
      },
    });

    // Seed 3 valid events manually to establish the chain
    let prevHash = "GENESIS";
    for (let i = 1; i <= 3; i++) {
      const payload = { data: `Valid event ${i}` };
      const payloadJson = JSON.stringify(payload);
      const payloadHash = hash(canonicalize(payload));
      const chainHash = hash(payloadHash + prevHash);

      await prisma.auditEvent.create({
        data: {
          projectId: PROJECT_ID,
          sequence: i,
          payloadJson,
          payloadHash,
          prevChainHash: prevHash,
          chainHash,
          createdAt: BigInt(Date.now()),
        },
      });
      prevHash = chainHash;
    }
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { id: PROJECT_ID } });
    await prisma.$disconnect();
  });

  it("MUST throw a cryptographic error if historical data is maliciously altered", async () => {
    // 1. Verify the chain is currently healthy
    let events = await loadAllEvents(PROJECT_ID);
    expect(() => verifyChain(events)).not.toThrow();

    // 2. The Attack: Alter Sequence 2 directly in the database, bypassing application logic
    const maliciousPayload = { data: "HACKED EVENT" };
    await prisma.auditEvent.update({
      where: { projectId_sequence: { projectId: PROJECT_ID, sequence: 2 } },
      data: { payloadJson: JSON.stringify(maliciousPayload) },
      // The chain is now broken.
    });

    // 3. Verification: Reload events and run verifyChain. It MUST fail.
    events = await loadAllEvents(PROJECT_ID);
    expect(() => verifyChain(events)).toThrow(
      /Internal hash chain corrupted at sequence 2/,
    );
  });
});

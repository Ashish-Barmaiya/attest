import { prisma } from "../src/db/database.js";
import { appendEventPersistent } from "../src/db/appendPersistent.js";
import { loadAllEvents } from "../src/db/loadAll.js";
import { verifyChain } from "../src/core/verify.js";

describe("Multitenant Isolation Tests", () => {
  const PROJECT_A = "multi-project-a";
  const PROJECT_B = "multi-project-b";

  beforeAll(async () => {
    // 1. Clean slate
    await prisma.project.deleteMany({
      where: { id: { in: [PROJECT_A, PROJECT_B] } },
    });

    // 2. Setup parent projects
    await prisma.project.createMany({
      data: [
        { id: PROJECT_A, name: "Tenant A", createdAt: BigInt(Date.now()) },
        { id: PROJECT_B, name: "Tenant B", createdAt: BigInt(Date.now()) },
      ],
    });

    // 3. Initialize separate chain heads
    await prisma.chainHead.createMany({
      data: [
        { projectId: PROJECT_A, lastSequence: 0, lastChainHash: "GENESIS_A" },
        { projectId: PROJECT_B, lastSequence: 0, lastChainHash: "GENESIS_B" },
      ],
    });
  });

  afterAll(async () => {
    // Cascading delete cleans up events and chain heads
    await prisma.project.deleteMany({
      where: { id: { in: [PROJECT_A, PROJECT_B] } },
    });
    await prisma.$disconnect();
  });

  it("Phases 1 & 2: Should support interleaved appends and maintain independent valid chains", async () => {
    // Append to A
    await appendEventPersistent(PROJECT_A, {
      action: "login",
      actor: { type: "user", id: "test-user-1" },
      resource: { type: "app", id: "dashboard" },
    });
    // Append to B
    await appendEventPersistent(PROJECT_B, {
      action: "login",
      actor: { type: "user", id: "test-user-2" },
      resource: { type: "app", id: "dashboard" },
    });
    // Append to A again
    await appendEventPersistent(PROJECT_A, {
      action: "logout",
      actor: { type: "user", id: "test-user-1" },
      resource: { type: "app", id: "dashboard" },
    });

    const eventsA = await loadAllEvents(PROJECT_A);
    const eventsB = await loadAllEvents(PROJECT_B);

    // Verify correct distribution of events
    expect(eventsA.length).toBe(2);
    expect(eventsB.length).toBe(1);

    // Verify cryptographic chains independently.
    // If verifyChain throws an error, Jest will automatically fail the test.
    expect(() => verifyChain(eventsA)).not.toThrow();
    expect(() => verifyChain(eventsB)).not.toThrow();
  });

  it("Phase 3 (Attacks 1 & 2): Should prevent data leakage and maintain independent sequences", async () => {
    const eventsA = await loadAllEvents(PROJECT_A);
    const eventsB = await loadAllEvents(PROJECT_B);

    // Attack 1: Leakage check (test-user-2 should not see test-user-1's actions)
    const leakedFromA = eventsB.find(
      (e) => e.payload.actor.id === "test-user-1",
    );
    expect(leakedFromA).toBeUndefined();

    // Attack 2: Sequence Collision Check (Isolation)
    const seqA = eventsA.map((e) => e.sequence);
    const seqB = eventsB.map((e) => e.sequence);

    // Both tenants should have an event at sequence 1, completely unaware of each other
    expect(seqA).toContain(1);
    expect(seqB).toContain(1);
  });

  it("Phase 3 (Attack 3): Should prevent appending to a non-existent project", async () => {
    // Expect the append function to throw an error when given a garbage project ID
    await expect(
      appendEventPersistent("INVALID_PROJECT", {
        action: "hack",
        actor: { type: "hacker", id: "eve" },
        resource: { type: "system", id: "root" },
      }),
    ).rejects.toThrow();
  });
});

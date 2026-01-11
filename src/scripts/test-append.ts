import { prisma } from "../db/database.js";

async function testAppend() {
  console.log("Testing append event...");

  const payload = {
    action: "LOGIN",
    actor: {
      type: "user",
      id: "test-user-123",
    },
    resource: {
      type: "system",
      id: "auth-service",
    },
    metadata: {
      timestamp: Date.now(),
    },
  };

  try {
    const res = await fetch("http://localhost:3000/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    console.log("Response:", data);

    if (
      typeof data.sequence !== "number" ||
      typeof data.chainHash !== "string"
    ) {
      throw new Error("Invalid response format");
    }

    // Verify in DB
    const event = await prisma.auditEvent.findUnique({
      where: {
        projectId_sequence: {
          projectId: data.projectId,
          sequence: data.sequence,
        },
      },
    });

    if (!event) {
      console.log("Event not found! Listing all events:");
      const allEvents = await prisma.auditEvent.findMany();
      console.log(allEvents);
      throw new Error("Event not found in database!");
    }

    console.log("Event persisted in DB:", event);
    console.log("Verification SUCCESS!");
  } catch (err) {
    console.error("Verification FAILED:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testAppend();

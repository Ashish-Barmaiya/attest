const API = "http://localhost:3000/events";
const API_KEY = process.env.API_KEY;

const TOTAL = 50000;
const DELAY_MS = 40; // ~25 writes/sec

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log(`Starting ingestion of ${TOTAL} events...`);

  for (let i = 1; i <= TOTAL; i++) {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify({
        action: "benchmark",
        actor: { type: "system", id: "bench" },
        resource: { type: "event", id: String(i) },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`❌ Failed at event ${i}:`, text);
      process.exit(1);
    }

    if (i % 1000 === 0) {
      console.log(`✓ Inserted ${i} events`);
    }

    await sleep(DELAY_MS);
  }

  console.log("✅ Ingestion complete");
}

run();

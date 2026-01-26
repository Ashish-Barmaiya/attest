import autocannon from "autocannon";

autocannon(
  {
    url: "http://localhost:3000/events",
    method: "POST",
    connections: 5,
    duration: 120,
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.API_KEY,
    },
    body: JSON.stringify({
      action: "heartbeat",
      actor: { type: "service", id: "svc" },
      resource: { type: "tick", id: "1" },
    }),
  },
  console.log,
);

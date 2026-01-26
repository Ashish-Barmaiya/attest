import autocannon from "autocannon";

autocannon(
  {
    url: "http://localhost:3000/events",
    method: "POST",
    connections: 200,
    duration: 10,
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.API_KEY,
    },
    body: JSON.stringify({
      action: "burst",
      actor: { type: "system", id: "load-test" },
      resource: { type: "stress", id: "burst" },
    }),
  },
  console.log,
);

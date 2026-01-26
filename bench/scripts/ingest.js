import autocannon from "autocannon";
import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

autocannon(
  {
    url: "http://localhost:3000/events",
    method: "POST",
    connections: 50,
    duration: 30,
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.API_KEY,
    },
    body: JSON.stringify({
      action: "login",
      actor: { type: "user", id: crypto.randomUUID() },
      resource: { type: "session", id: crypto.randomUUID() },
    }),
  },
  console.log,
);

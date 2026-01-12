import fs from "fs";
import path from "path";

export interface AnchorPayload {
  projectId: string;
  lastSequence: number;
  lastChainHash: string;
  anchoredAt: number;
}

export function readAnchor(
  projectId: string,
  anchorDir: string
): AnchorPayload {
  const filePath = path.join(anchorDir, `project-${projectId}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Anchor file not found for project ${projectId} at ${filePath}`
    );
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `Failed to read anchor file for project ${projectId}: ${err}`
    );
  }

  let payload: any;
  try {
    payload = JSON.parse(content);
  } catch (err) {
    throw new Error(`Invalid JSON in anchor file for project ${projectId}`);
  }

  // Validate fields
  if (typeof payload.projectId !== "string")
    throw new Error("Invalid anchor: missing or invalid projectId");
  if (typeof payload.lastSequence !== "number")
    throw new Error("Invalid anchor: missing or invalid lastSequence");
  if (typeof payload.lastChainHash !== "string")
    throw new Error("Invalid anchor: missing or invalid lastChainHash");
  if (typeof payload.anchoredAt !== "number")
    throw new Error("Invalid anchor: missing or invalid anchoredAt");

  if (payload.projectId !== projectId) {
    throw new Error(
      `Anchor projectId mismatch: expected ${projectId}, got ${payload.projectId}`
    );
  }

  return payload as AnchorPayload;
}

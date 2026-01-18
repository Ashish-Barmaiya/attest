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
  // 1. Find the latest anchor file (YYYY-MM-DD-HH.json)
  const files = fs.readdirSync(anchorDir).filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    throw new Error(`No anchor files found in ${anchorDir}`);
  }

  // Sort descending to get the latest
  files.sort().reverse();
  const latestFile = files[0];

  if (!latestFile) {
    throw new Error(`No anchor files found in ${anchorDir}`);
  }

  const filePath = path.join(anchorDir, latestFile);

  // 2. Read and parse
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(`Failed to read anchor file ${filePath}: ${err}`);
  }

  let payload: any;
  try {
    payload = JSON.parse(content);
  } catch (err) {
    throw new Error(`Invalid JSON in anchor file ${filePath}`);
  }

  // 3. Find project anchor
  if (!payload.anchors || !Array.isArray(payload.anchors)) {
    throw new Error(
      `Invalid anchor format in ${filePath}: missing anchors array`
    );
  }

  const projectAnchor = payload.anchors.find(
    (a: any) => a.projectId === projectId
  );

  if (!projectAnchor) {
    throw new Error(
      `Project ${projectId} not found in latest anchor file ${latestFile}`
    );
  }

  // 4. Return formatted payload
  return {
    projectId: projectAnchor.projectId,
    lastSequence: projectAnchor.lastSequence,
    lastChainHash: projectAnchor.lastChainHash,
    anchoredAt: new Date(payload.timestamp).getTime(),
  };
}

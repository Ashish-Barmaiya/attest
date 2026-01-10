import { z } from "zod";

export const AuditPayloadSchema = z.object({
  action: z.string(),
  actor: z.object({
    type: z.string(),
    id: z.string(),
  }),
  resource: z.object({
    type: z.string(),
    id: z.string(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AuditPayload = z.infer<typeof AuditPayloadSchema>;

export type AuditEvent = {
  readonly sequence: number;
  readonly payload: AuditPayload;
  readonly payloadHash: string;
  readonly prevChainHash: string;
  readonly chainHash: string;
};

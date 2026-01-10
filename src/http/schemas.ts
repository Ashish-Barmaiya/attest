import { z } from "zod";

export const IngestEventSchema = z.object({
  action: z.string().min(1),
  actor: z.object({
    type: z.string().min(1),
    id: z.string().min(1),
  }),
  resource: z.object({
    type: z.string().min(1),
    id: z.string().min(1),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type IngestEvent = z.infer<typeof IngestEventSchema>;

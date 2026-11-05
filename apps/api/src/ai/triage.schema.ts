import { TicketPriority } from '@prisma/client';
import * as z from 'zod/v4';

export const CATEGORIES = [
  'billing',
  'bug',
  'account',
  'feature_request',
  'how_to',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * What the model must return for a new ticket. Sent to the API as the output format
 * (structured outputs: the response is constrained to this JSON schema), then
 * validated again on our side: never trust model output blindly.
 */
export const TriageSchema = z.object({
  category: z.enum(CATEGORIES),
  priority: z.enum([
    TicketPriority.LOW,
    TicketPriority.MEDIUM,
    TicketPriority.HIGH,
    TicketPriority.URGENT,
  ]),
  summary: z
    .string()
    .describe('One sentence, in the language of the ticket, for the agent'),
});
export type Triage = z.infer<typeof TriageSchema>;

/** Parses and validates the model's JSON text. Throws on anything unexpected. */
export function parseTriage(text: string): Triage {
  const triage = TriageSchema.parse(JSON.parse(text));
  return { ...triage, summary: triage.summary.trim().slice(0, 500) };
}

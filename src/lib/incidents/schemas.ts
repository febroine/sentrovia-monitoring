import { z } from "zod";

export const incidentUpdateSchema = z.object({ acknowledge: z.boolean().optional(), assignedToUserId: z.string().uuid().nullable().optional(), escalationLevel: z.number().int().min(0).max(3).optional(), note: z.object({ message: z.string().trim().min(1).max(2_000), visibility: z.enum(["internal", "public"]), updateType: z.enum(["note", "status"]) }).optional() }).refine((input) => Object.keys(input).length > 0, "Choose an incident update.");

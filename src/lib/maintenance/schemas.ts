import { z } from "zod";

export const maintenanceWindowSchema = z.object({ monitorId: z.string().uuid().nullable(), kind: z.enum(["maintenance", "silence"]), title: z.string().trim().min(3).max(160), startsAt: z.coerce.date(), endsAt: z.coerce.date() }).refine((input) => input.endsAt > input.startsAt, { message: "End time must be after start time.", path: ["endsAt"] });

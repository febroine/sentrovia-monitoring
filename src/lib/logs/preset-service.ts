import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { logFilterPresets } from "@/lib/db/schema";
import { logFiltersSchema } from "@/lib/logs/schemas";
import type { LogFilters } from "@/lib/logs/types";

export function parseLogPresetFilters(value: string): LogFilters | null {
  try {
    const parsed = logFiltersSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listLogFilterPresets(userId: string) {
  const rows = await db
    .select()
    .from(logFilterPresets)
    .where(eq(logFilterPresets.userId, userId))
    .orderBy(desc(logFilterPresets.updatedAt))
    .limit(12);

  return rows.flatMap((row) => {
    const filters = parseLogPresetFilters(row.filtersJson);
    return filters ? [{ id: row.id, name: row.name, filters }] : [];
  });
}

export async function upsertLogFilterPreset(userId: string, input: { name: string; filters: LogFilters }) {
  const values = {
    userId,
    name: input.name.trim(),
    filtersJson: JSON.stringify(input.filters),
    updatedAt: new Date(),
  };

  const [preset] = await db
    .insert(logFilterPresets)
    .values(values)
    .onConflictDoUpdate({
      target: [logFilterPresets.userId, logFilterPresets.name],
      set: {
        filtersJson: values.filtersJson,
        updatedAt: values.updatedAt,
      },
    })
    .returning();
  return preset;
}

export async function deleteLogFilterPreset(userId: string, presetId: string) {
  const [preset] = await db
    .delete(logFilterPresets)
    .where(and(eq(logFilterPresets.userId, userId), eq(logFilterPresets.id, presetId)))
    .returning({ id: logFilterPresets.id });

  return preset ?? null;
}

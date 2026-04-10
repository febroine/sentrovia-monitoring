import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { logFilterPresets } from "@/lib/db/schema";
import type { LogFilters } from "@/lib/logs/types";

export async function listLogFilterPresets(userId: string) {
  const rows = await db
    .select()
    .from(logFilterPresets)
    .where(eq(logFilterPresets.userId, userId))
    .orderBy(desc(logFilterPresets.updatedAt))
    .limit(12);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    filters: JSON.parse(row.filtersJson) as LogFilters,
  }));
}

export async function upsertLogFilterPreset(userId: string, input: { name: string; filters: LogFilters }) {
  const existingRows = await db
    .select()
    .from(logFilterPresets)
    .where(and(eq(logFilterPresets.userId, userId), eq(logFilterPresets.name, input.name.trim())))
    .limit(1);

  const values = {
    userId,
    name: input.name.trim(),
    filtersJson: JSON.stringify(input.filters),
    updatedAt: new Date(),
  };

  if (existingRows[0]) {
    const [preset] = await db
      .update(logFilterPresets)
      .set(values)
      .where(eq(logFilterPresets.id, existingRows[0].id))
      .returning();
    return preset;
  }

  const [preset] = await db.insert(logFilterPresets).values(values).returning();
  return preset;
}

export async function deleteLogFilterPreset(userId: string, presetId: string) {
  const [preset] = await db
    .delete(logFilterPresets)
    .where(and(eq(logFilterPresets.userId, userId), eq(logFilterPresets.id, presetId)))
    .returning({ id: logFilterPresets.id });

  return preset ?? null;
}

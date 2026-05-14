import { count, eq } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db } from "./client";
import { finding } from "./schema";

export type FindingInsert = InferInsertModel<typeof finding>;
export type FindingSelect = InferSelectModel<typeof finding>;

export async function createFinding(data: FindingInsert) {
  const [row] = await db.insert(finding).values(data).returning();
  return row;
}

export async function createFindings(data: FindingInsert[]) {
  return db.insert(finding).values(data).returning();
}

export async function getFindingById(id: string) {
  const [row] = await db.select().from(finding).where(eq(finding.id, id));
  return row;
}

export async function getFindingsByScanId(scanId: string) {
  return db.select().from(finding).where(eq(finding.scanId, scanId));
}

export async function getFindingsCountByScanId(scanId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(finding)
    .where(eq(finding.scanId, scanId));

  return row?.value ?? 0;
}

export async function updateFinding(id: string, data: Partial<FindingInsert>) {
  const [row] = await db
    .update(finding)
    .set(data)
    .where(eq(finding.id, id))
    .returning();
  return row;
}

export async function deleteFinding(id: string) {
  const [row] = await db.delete(finding).where(eq(finding.id, id)).returning();
  return row;
}

export async function deleteFindingsByScanId(scanId: string) {
  return db.delete(finding).where(eq(finding.scanId, scanId)).returning();
}

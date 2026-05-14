import { eq, desc } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { db } from "./client";
import { scan } from "./schema";

export type ScanInsert = InferInsertModel<typeof scan>;
export type ScanSelect = InferSelectModel<typeof scan>;

export async function createScan(data: ScanInsert) {
  const [row] = await db.insert(scan).values(data).returning();
  return row;
}

export async function getScanById(id: string) {
  const [row] = await db.select().from(scan).where(eq(scan.id, id));
  return row;
}

export async function getScansByUserId(userId: string) {
  return db.select().from(scan).where(eq(scan.userId, userId)).orderBy(desc(scan.createdAt));
}

export async function getScanByShareToken(token: string) {
  const [row] = await db.select().from(scan).where(eq(scan.shareToken, token));
  return row;
}

export async function updateScan(id: string, data: Partial<ScanInsert>) {
  const [row] = await db
    .update(scan)
    .set(data)
    .where(eq(scan.id, id))
    .returning();
  return row;
}

export async function updateScanStatus(
  id: string,
  status: ScanInsert["status"],
  errorMessage?: string
) {
  const [row] = await db
    .update(scan)
    .set({ status, errorMessage, updatedAt: new Date() })
    .where(eq(scan.id, id))
    .returning();
  return row;
}

export async function deleteScan(id: string) {
  const [row] = await db.delete(scan).where(eq(scan.id, id)).returning();
  return row;
}

import { eq } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";

import { db } from "./client";
import { analysisHistory } from "./schema";

export type AnalysisHistoryInsert = InferInsertModel<typeof analysisHistory>;
export type AnalysisHistorySelect = InferSelectModel<typeof analysisHistory>;

export async function createAnalysisHistoryEntry(data: AnalysisHistoryInsert) {
  const [row] = await db.insert(analysisHistory).values(data).returning();
  return row;
}

export async function createAnalysisHistoryEntries(
  data: AnalysisHistoryInsert[],
) {
  return db.insert(analysisHistory).values(data).returning();
}

export async function getAnalysisHistoryByScanId(scanId: string) {
  return db
    .select()
    .from(analysisHistory)
    .where(eq(analysisHistory.scanId, scanId));
}

export async function deleteAnalysisHistoryByScanId(scanId: string) {
  return db
    .delete(analysisHistory)
    .where(eq(analysisHistory.scanId, scanId))
    .returning();
}

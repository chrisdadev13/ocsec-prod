import "server-only";

import { createHash } from "node:crypto";

import {
  createAnalysisHistoryEntries,
  deleteAnalysisHistoryByScanId,
  type AnalysisHistoryInsert,
} from "@/lib/db/analysis-history";
import {
  createFindings,
  deleteFindingsByScanId,
  type FindingInsert,
} from "@/lib/db/findings";
import { updateScan } from "@/lib/db/scan";
import type { DeepsecAnalysisArtifacts } from "@/lib/scans/runner";

const INSERT_BATCH_SIZE = 100;

type ExportedFinding = {
  title?: unknown;
  description?: unknown;
  severity?: unknown;
  recommendation?: unknown;
  metadata?: {
    filePath?: unknown;
    lineNumbers?: unknown;
    severity?: unknown;
    vulnSlug?: unknown;
    confidence?: unknown;
  };
};

type DeepsecUsage = {
  inputTokens?: unknown;
  outputTokens?: unknown;
  cacheReadInputTokens?: unknown;
  cacheCreationInputTokens?: unknown;
};

type DeepsecRefusal = {
  refused?: unknown;
  raw?: unknown;
  skipped?: unknown;
};

type DeepsecAnalysisEntry = {
  runId?: unknown;
  investigatedAt?: unknown;
  durationMs?: unknown;
  agentType?: unknown;
  model?: unknown;
  modelConfig?: unknown;
  agentSessionId?: unknown;
  findingCount?: unknown;
  numTurns?: unknown;
  costUsd?: unknown;
  usage?: DeepsecUsage | null;
  refusal?: DeepsecRefusal | null;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number");
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asSkippedReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item === "string") {
      return item;
    }

    if (item && typeof item === "object" && "reason" in item) {
      const reason = item.reason;
      if (typeof reason === "string" && reason.length > 0) {
        return reason;
      }
    }

    return [];
  });
}

function normalizeFinding(scanId: string, item: ExportedFinding): FindingInsert | null {
  const metadata = item.metadata ?? {};
  const filePath = asString(metadata.filePath);
  const severity = asString(metadata.severity || item.severity).toUpperCase();
  const vulnSlug = asString(metadata.vulnSlug, "other-exported-finding");
  const title = asString(item.title);
  const description = asString(item.description);

  if (!filePath || !severity || !title || !description) {
    return null;
  }

  const stableId = createHash("sha256")
    .update(scanId)
    .update("\0")
    .update(filePath)
    .update("\0")
    .update(severity)
    .update("\0")
    .update(vulnSlug)
    .update("\0")
    .update(title)
    .digest("hex")
    .slice(0, 32);

  return {
    id: `${scanId}-${stableId}`,
    scanId,
    filePath,
    severity,
    vulnSlug,
    title,
    description,
    recommendation: asNullableString(item.recommendation),
    lineNumbers: asNumberArray(metadata.lineNumbers),
    confidence: asNullableString(metadata.confidence),
    confirmed: false,
    attackPayload: null,
    attackResponse: null,
    attackExplanation: null,
    createdAt: new Date(),
  };
}

function buildSummary(findings: FindingInsert[]) {
  const files = new Set<string>();
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const finding of findings) {
    files.add(finding.filePath);

    if (finding.severity === "CRITICAL") criticalCount += 1;
    if (finding.severity === "HIGH" || finding.severity === "HIGH_BUG") highCount += 1;
    if (finding.severity === "MEDIUM") mediumCount += 1;
    if (finding.severity === "LOW") lowCount += 1;
  }

  return {
    filesAnalyzed: files.size,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
  };
}

export async function ingestFindingsJson(scanId: string, jsonText: string) {
  const parsed = JSON.parse(jsonText) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("findings.json must contain an array");
  }

  const exportedFindings = parsed as ExportedFinding[];
  const normalized = exportedFindings
    .map((item) => normalizeFinding(scanId, item))
    .filter((item): item is FindingInsert => item !== null);

  await updateScan(scanId, {
    rawFindings: exportedFindings,
    filesAnalyzed: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    updatedAt: new Date(),
  });

  await deleteFindingsByScanId(scanId);

  for (let index = 0; index < normalized.length; index += INSERT_BATCH_SIZE) {
    const batch = normalized.slice(index, index + INSERT_BATCH_SIZE);

    if (batch.length > 0) {
      await createFindings(batch);
    }

    const partial = buildSummary(normalized.slice(0, index + batch.length));

    await updateScan(scanId, {
      ...partial,
      updatedAt: new Date(),
    });
  }

  if (normalized.length === 0) {
    await updateScan(scanId, {
      filesAnalyzed: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      updatedAt: new Date(),
    });
  }

  return {
    inserted: normalized.length,
  };
}

export async function ingestAnalysisArtifacts(
  scanId: string,
  artifacts: DeepsecAnalysisArtifacts,
) {
  const runsById = new Map(
    artifacts.runs
      .filter((run) => run.type === "process")
      .map((run) => [run.runId, run]),
  );

  const normalized: AnalysisHistoryInsert[] = [];

  for (const file of artifacts.files) {
    for (const item of file.analysisHistory) {
      const entry = item as DeepsecAnalysisEntry;
      const runId = asString(entry.runId);
      const investigatedAt = asString(entry.investigatedAt);
      const agentType = asString(entry.agentType);
      const model = asString(entry.model);

      if (!runId || !investigatedAt || !agentType || !model) {
        continue;
      }

      const stableId = createHash("sha256")
        .update(scanId)
        .update("\0")
        .update(file.filePath)
        .update("\0")
        .update(runId)
        .update("\0")
        .update(investigatedAt)
        .digest("hex")
        .slice(0, 32);

      normalized.push({
        id: `${scanId}-${stableId}`,
        scanId,
        filePath: file.filePath,
        runId,
        investigatedAt: new Date(investigatedAt),
        durationMs: Math.max(0, Math.round(asNumber(entry.durationMs))),
        phase: runsById.get(runId)?.phase ?? "unknown",
        agentType,
        model,
        modelConfig: asRecord(entry.modelConfig),
        agentSessionId: asNullableString(entry.agentSessionId),
        findingCount: Math.max(0, Math.round(asNumber(entry.findingCount))),
        numTurns:
          asNullableNumber(entry.numTurns) === null
            ? null
            : Math.max(0, Math.round(asNumber(entry.numTurns))),
        costUsd:
          asNullableNumber(entry.costUsd) === null
            ? null
            : String(entry.costUsd),
        usage: {
          inputTokens: asNumber(entry.usage?.inputTokens),
          outputTokens: asNumber(entry.usage?.outputTokens),
          cacheReadInputTokens: asNumber(entry.usage?.cacheReadInputTokens),
          cacheCreationInputTokens: asNumber(
            entry.usage?.cacheCreationInputTokens,
          ),
        },
        refusal: {
          refused: Boolean(entry.refusal?.refused),
          raw: asString(entry.refusal?.raw),
          skipped: asSkippedReasons(entry.refusal?.skipped),
        },
        createdAt: new Date(),
      });
    }
  }

  await deleteAnalysisHistoryByScanId(scanId);

  for (let index = 0; index < normalized.length; index += INSERT_BATCH_SIZE) {
    const batch = normalized.slice(index, index + INSERT_BATCH_SIZE);

    if (batch.length > 0) {
      await createAnalysisHistoryEntries(batch);
    }
  }

  return {
    inserted: normalized.length,
  };
}

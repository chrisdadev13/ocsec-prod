import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { getAnalysisHistoryByScanId } from "@/lib/db/analysis-history";
import { getFindingsByScanId } from "@/lib/db/findings";
import { getScanById } from "@/lib/db/scan";

type FindingSeverity =
  | "CRITICAL"
  | "HIGH"
  | "HIGH_BUG"
  | "MEDIUM"
  | "LOW"
  | "INFO"
  | "BUG";

type Summary = {
  filesAnalyzed: number;
  totalFindings: number;
  critical: number;
  high: number;
  highBug: number;
  medium: number;
  low: number;
  info: number;
  bug: number;
};

type Overview = {
  summary: string;
  keyPoints: string[];
  remediationPriorities: string[];
  notableFiles: Array<{
    filePath: string;
    findingCount: number;
    topSeverity: string;
  }>;
  model: string;
  generatedAt: string;
};

function toLineNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number");
}

function buildSummary(
  findings: Array<{ severity: string }>,
  filesAnalyzed: number,
): Summary {
  const counts: Record<FindingSeverity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    HIGH_BUG: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
    BUG: 0,
  };

  for (const finding of findings) {
    if (finding.severity in counts) {
      counts[finding.severity as FindingSeverity] += 1;
    }
  }

  return {
    filesAnalyzed,
    totalFindings: findings.length,
    critical: counts.CRITICAL,
    high: counts.HIGH,
    highBug: counts.HIGH_BUG,
    medium: counts.MEDIUM,
    low: counts.LOW,
    info: counts.INFO,
    bug: counts.BUG,
  };
}

function asUsage(value: unknown) {
  const usage =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    inputTokens: typeof usage.inputTokens === "number" ? usage.inputTokens : 0,
    outputTokens:
      typeof usage.outputTokens === "number" ? usage.outputTokens : 0,
    cacheReadInputTokens:
      typeof usage.cacheReadInputTokens === "number"
        ? usage.cacheReadInputTokens
        : 0,
    cacheCreationInputTokens:
      typeof usage.cacheCreationInputTokens === "number"
        ? usage.cacheCreationInputTokens
        : 0,
  };
}

function asRefusal(value: unknown) {
  const refusal =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const skipped =
    Array.isArray(refusal.skipped)
      ? refusal.skipped.filter((item): item is string => typeof item === "string")
      : [];

  return {
    refused: typeof refusal.refused === "boolean" ? refusal.refused : false,
    skipped,
    raw: typeof refusal.raw === "string" ? refusal.raw : "",
  };
}

function asOverview(value: unknown): Overview | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const overview = value as Record<string, unknown>;

  if (typeof overview.summary !== "string") {
    return null;
  }

  return {
    summary: overview.summary,
    keyPoints: Array.isArray(overview.keyPoints)
      ? overview.keyPoints.filter((item): item is string => typeof item === "string")
      : [],
    remediationPriorities: Array.isArray(overview.remediationPriorities)
      ? overview.remediationPriorities.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    notableFiles: Array.isArray(overview.notableFiles)
      ? overview.notableFiles
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }

            const file = item as Record<string, unknown>;

            if (typeof file.filePath !== "string") {
              return null;
            }

            return {
              filePath: file.filePath,
              findingCount:
                typeof file.findingCount === "number" ? file.findingCount : 0,
              topSeverity:
                typeof file.topSeverity === "string" ? file.topSeverity : "INFO",
            };
          })
          .filter(
            (item): item is Overview["notableFiles"][number] => item !== null,
          )
      : [],
    model: typeof overview.model === "string" ? overview.model : "unknown",
    generatedAt:
      typeof overview.generatedAt === "string" ? overview.generatedAt : "",
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const scan = await getScanById(id);

    if (!scan || scan.userId !== session.user.id) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    const findings = await getFindingsByScanId(scan.id);
    const analysisHistory = await getAnalysisHistoryByScanId(scan.id);
    const normalizedFindings = findings.map((finding) => ({
      ...finding,
      lineNumbers: toLineNumbers(finding.lineNumbers),
    }));
    const normalizedAnalysisHistory = analysisHistory.map((entry) => ({
      filePath: entry.filePath,
      runId: entry.runId,
      investigatedAt: entry.investigatedAt,
      durationMs: entry.durationMs,
      phase: entry.phase,
      agentType: entry.agentType,
      model: entry.model,
      modelConfig:
        entry.modelConfig && typeof entry.modelConfig === "object"
          ? entry.modelConfig
          : {},
      agentSessionId: entry.agentSessionId,
      findingCount: entry.findingCount,
      numTurns: entry.numTurns,
      costUsd: entry.costUsd === null ? null : Number(entry.costUsd),
      usage: asUsage(entry.usage),
      refusal: asRefusal(entry.refusal),
    }));
    const latestRunId = normalizedAnalysisHistory
      .slice()
      .sort(
        (a, b) =>
          new Date(b.investigatedAt).getTime() -
          new Date(a.investigatedAt).getTime(),
      )[0]?.runId;

    return NextResponse.json({
      scan: {
        id: scan.id,
        runId: latestRunId ?? null,
        targetUrl: scan.targetUrl,
        repoUrl: scan.repoUrl,
        mode: scan.mode,
        status: scan.status,
        errorMessage: scan.errorMessage,
        createdAt: scan.createdAt,
        updatedAt: scan.updatedAt,
        completedAt: scan.completedAt,
        overview: asOverview(scan.overview),
        overviewError: scan.overviewError,
      },
      summary: buildSummary(normalizedFindings, scan.filesAnalyzed),
      findings: normalizedFindings,
      analysisHistory: normalizedAnalysisHistory,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

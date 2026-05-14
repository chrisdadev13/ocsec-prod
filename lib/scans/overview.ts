import "server-only";

import { getAnalysisHistoryByScanId } from "@/lib/db/analysis-history";
import { getFindingsByScanId } from "@/lib/db/findings";
import { updateScan } from "@/lib/db/scan";

type FindingSeverity =
  | "CRITICAL"
  | "HIGH"
  | "HIGH_BUG"
  | "MEDIUM"
  | "LOW"
  | "INFO"
  | "BUG";

export type ScanOverview = {
  summary: string;
  keyPoints: string[];
  remediationPriorities: string[];
  notableFiles: Array<{
    filePath: string;
    findingCount: number;
    topSeverity: FindingSeverity;
  }>;
  model: string;
  generatedAt: string;
};

type OpenAiResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  HIGH_BUG: 2,
  MEDIUM: 3,
  LOW: 4,
  INFO: 5,
  BUG: 6,
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toSeverity(value: unknown): FindingSeverity {
  switch (value) {
    case "CRITICAL":
    case "HIGH":
    case "HIGH_BUG":
    case "MEDIUM":
    case "LOW":
    case "INFO":
    case "BUG":
      return value;
    default:
      return "INFO";
  }
}

function uniqueNonEmpty(values: unknown, limit: number) {
  if (!Array.isArray(values)) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const item = asString(value);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= limit) break;
  }

  return out;
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function buildNotableFiles(findings: Awaited<ReturnType<typeof getFindingsByScanId>>) {
  const files = findings.reduce(
    (map, finding) => {
      const current = map.get(finding.filePath) ?? {
        filePath: finding.filePath,
        findingCount: 0,
        topSeverity: toSeverity(finding.severity),
      };

      current.findingCount += 1;
      if (
        SEVERITY_RANK[toSeverity(finding.severity)] <
        SEVERITY_RANK[current.topSeverity]
      ) {
        current.topSeverity = toSeverity(finding.severity);
      }

      map.set(finding.filePath, current);
      return map;
    },
    new Map<
      string,
      {
        filePath: string;
        findingCount: number;
        topSeverity: FindingSeverity;
      }
    >(),
  );

  return Array.from(files.values())
    .sort((a, b) => {
      const severityDiff = SEVERITY_RANK[a.topSeverity] - SEVERITY_RANK[b.topSeverity];
      if (severityDiff !== 0) return severityDiff;
      return b.findingCount - a.findingCount;
    })
    .slice(0, 5);
}

function resolveOpenAiConfig() {
  const apiKey =
    process.env.OPENAI_API_KEY ||
    (process.env.AI_GATEWAY_API_KEY?.startsWith("sk-")
      ? process.env.AI_GATEWAY_API_KEY
      : undefined);

  if (!apiKey) {
    return null;
  }

  const configuredBaseUrl = process.env.OPENAI_BASE_URL?.trim();

  return {
    apiKey,
    baseUrl:
      configuredBaseUrl && !configuredBaseUrl.includes("ai-gateway.vercel.sh")
        ? configuredBaseUrl.replace(/\/+$/, "")
        : "https://api.openai.com/v1",
    model:
      process.env.OPENAI_OVERVIEW_MODEL?.trim() ||
      process.env.DEEPSEC_MODEL?.trim() ||
      "gpt-5-mini",
  };
}

function buildFallbackOverview(
  scanId: string,
  notableFiles: ScanOverview["notableFiles"],
  summary: {
    filesAnalyzed: number;
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  },
  model: string,
): ScanOverview {
  const severityParts = [
    summary.critical > 0 ? `${summary.critical} critical` : null,
    summary.high > 0 ? `${summary.high} high` : null,
    summary.medium > 0 ? `${summary.medium} medium` : null,
    summary.low > 0 ? `${summary.low} low` : null,
  ].filter((part): part is string => part !== null);

  const severityLine = severityParts.length > 0 ? severityParts.join(", ") : "no findings";

  return {
    summary:
      summary.totalFindings > 0
        ? `Scan ${scanId} found ${summary.totalFindings} issues across ${summary.filesAnalyzed} files, led by ${severityLine}.`
        : `Scan ${scanId} completed with no persisted findings across ${summary.filesAnalyzed} files.`,
    keyPoints:
      summary.totalFindings > 0
        ? [
            `${summary.totalFindings} findings were persisted for triage.`,
            `Highest-priority issues are concentrated in ${severityLine}.`,
          ]
        : ["No findings were persisted for this run."],
    remediationPriorities:
      summary.totalFindings > 0
        ? [
            "Start with critical and high-severity findings.",
            "Resolve repeated problems by file to shrink the attack surface faster.",
          ]
        : ["No remediation priorities were generated because no findings were stored."],
    notableFiles,
    model,
    generatedAt: new Date().toISOString(),
  };
}

function normalizeOverview(value: unknown, fallback: ScanOverview, model: string): ScanOverview {
  const parsed = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const notableFilesRaw = Array.isArray(parsed.notableFiles) ? parsed.notableFiles : [];
  const notableFiles = notableFilesRaw
    .map((item) => {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const filePath = asString(record.filePath);
      if (!filePath) return null;

      return {
        filePath,
        findingCount:
          typeof record.findingCount === "number" && Number.isFinite(record.findingCount)
            ? Math.max(0, Math.round(record.findingCount))
            : 0,
        topSeverity: toSeverity(record.topSeverity),
      };
    })
    .filter((item): item is ScanOverview["notableFiles"][number] => item !== null)
    .slice(0, 5);

  return {
    summary: asString(parsed.summary) || fallback.summary,
    keyPoints: uniqueNonEmpty(parsed.keyPoints, 4).slice(0, 4).concat(),
    remediationPriorities: uniqueNonEmpty(parsed.remediationPriorities, 4)
      .slice(0, 4)
      .concat(),
    notableFiles: notableFiles.length > 0 ? notableFiles : fallback.notableFiles,
    model,
    generatedAt: new Date().toISOString(),
  };
}

export async function generateAndStoreScanOverview(scanId: string, projectId: string) {
  const [findings, analysisHistory] = await Promise.all([
    getFindingsByScanId(scanId),
    getAnalysisHistoryByScanId(scanId),
  ]);

  const summary = findings.reduce(
    (acc, finding) => {
      acc.files.add(finding.filePath);
      acc.totalFindings += 1;

      const severity = toSeverity(finding.severity);
      if (severity === "CRITICAL") acc.critical += 1;
      if (severity === "HIGH" || severity === "HIGH_BUG") acc.high += 1;
      if (severity === "MEDIUM") acc.medium += 1;
      if (severity === "LOW") acc.low += 1;

      return acc;
    },
    {
      files: new Set<string>(),
      totalFindings: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    },
  );

  const notableFiles = buildNotableFiles(findings);
  const config = resolveOpenAiConfig();
  const fallback = buildFallbackOverview(
    scanId,
    notableFiles,
    {
      filesAnalyzed: summary.files.size,
      totalFindings: summary.totalFindings,
      critical: summary.critical,
      high: summary.high,
      medium: summary.medium,
      low: summary.low,
    },
    config?.model ?? "fallback",
  );

  if (!config || findings.length === 0) {
    await updateScan(scanId, {
      overview: fallback,
      overviewError: config
        ? null
        : "OPENAI_API_KEY not configured for overview generation",
      updatedAt: new Date(),
    });

    return fallback;
  }

  const payload = {
    projectId,
    summary: {
      filesAnalyzed: summary.files.size,
      totalFindings: summary.totalFindings,
      critical: summary.critical,
      high: summary.high,
      medium: summary.medium,
      low: summary.low,
    },
    notableFiles,
    topFindings: findings
      .slice()
      .sort(
        (a, b) =>
          SEVERITY_RANK[toSeverity(a.severity)] - SEVERITY_RANK[toSeverity(b.severity)],
      )
      .slice(0, 12)
      .map((finding) => ({
        filePath: finding.filePath,
        severity: toSeverity(finding.severity),
        title: truncate(finding.title, 140),
        vulnSlug: finding.vulnSlug,
        lineNumbers: Array.isArray(finding.lineNumbers) ? finding.lineNumbers : [],
        recommendation: truncate(asString(finding.recommendation), 220),
      })),
    recentRuns: analysisHistory
      .slice()
      .sort(
        (a, b) =>
          new Date(b.investigatedAt).getTime() - new Date(a.investigatedAt).getTime(),
      )
      .slice(0, 8)
      .map((entry) => ({
        filePath: entry.filePath,
        phase: entry.phase,
        agentType: entry.agentType,
        model: entry.model,
        findingCount: entry.findingCount,
      })),
  };

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write short security scan overviews for engineers. Return strict JSON with keys summary, keyPoints, remediationPriorities, and notableFiles. Keep summary to 2-4 sentences. Keep bullets concrete and concise.",
        },
        {
          role: "user",
          content: JSON.stringify(payload),
        },
      ],
    }),
  });

  if (!response.ok) {
    const message = truncate(await response.text(), 800);
    await updateScan(scanId, {
      overview: fallback,
      overviewError: `Overview generation failed: ${message}`,
      updatedAt: new Date(),
    });
    return fallback;
  }

  const json = (await response.json()) as OpenAiResponse;
  const content = json.choices?.[0]?.message?.content;

  if (!content) {
    await updateScan(scanId, {
      overview: fallback,
      overviewError: "Overview generation returned an empty response",
      updatedAt: new Date(),
    });
    return fallback;
  }

  let overview: ScanOverview;

  try {
    overview = normalizeOverview(JSON.parse(content), fallback, config.model);
  } catch {
    await updateScan(scanId, {
      overview: fallback,
      overviewError: "Overview generation returned invalid JSON",
      updatedAt: new Date(),
    });
    return fallback;
  }

  if (overview.keyPoints.length === 0) {
    overview.keyPoints = fallback.keyPoints;
  }

  if (overview.remediationPriorities.length === 0) {
    overview.remediationPriorities = fallback.remediationPriorities;
  }

  await updateScan(scanId, {
    overview,
    overviewError: null,
    updatedAt: new Date(),
  });

  return overview;
}

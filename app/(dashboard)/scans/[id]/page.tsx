"use client";

import { CaretDownIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Severities emitted by the cybersecurity agent (uppercase / underscore). */
type AgentSeverity =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INFO"
  | "BUG"
  | "HIGH_BUG";

type ConfidenceLevel = "high" | "medium" | "low";

type RefusalInfo = {
  readonly refused: boolean;
  readonly skipped: readonly string[];
  readonly raw: string;
};

type TokenUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationInputTokens: number;
};

type AnalysisHistoryEntry = {
  readonly runId: string;
  readonly investigatedAt: string;
  readonly durationMs: number;
  readonly agentType: string;
  readonly model: string;
  readonly modelConfig: { readonly model: string };
  readonly agentSessionId: string;
  readonly findingCount: number;
  readonly numTurns: number;
  readonly phase: string;
  readonly costUsd: number;
  readonly usage: TokenUsage;
  readonly refusal: RefusalInfo;
};

type AgentFinding = {
  readonly severity: AgentSeverity;
  readonly vulnSlug: string;
  readonly title: string;
  readonly description: string;
  readonly lineNumbers: readonly number[];
  readonly recommendation: string;
  readonly confidence: ConfidenceLevel;
  readonly producedByRunId: string;
};

type AnalyzedFile = {
  readonly filePath: string;
  readonly findings: readonly AgentFinding[];
  readonly analysisHistory: readonly AnalysisHistoryEntry[];
};

type ScanReportSummary = {
  readonly filesAnalyzed: number;
  readonly totalFindings: number;
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly highBug: number;
  readonly bug: number;
};

type SecurityScanReport = {
  readonly projectId: string;
  readonly generatedAt: string;
  readonly runId: string | null;
  readonly status: string;
  readonly errorMessage: string | null;
  readonly overview:
    | {
        readonly summary: string;
        readonly keyPoints: readonly string[];
        readonly remediationPriorities: readonly string[];
        readonly notableFiles: readonly {
          readonly filePath: string;
          readonly findingCount: number;
          readonly topSeverity: string;
        }[];
        readonly model: string;
        readonly generatedAt: string;
      }
    | null;
  readonly overviewError: string | null;
  readonly summary: ScanReportSummary;
  readonly files: readonly AnalyzedFile[];
};

type ScanFindingRecord = {
  readonly id: string;
  readonly filePath: string;
  readonly severity: string;
  readonly vulnSlug: string;
  readonly title: string;
  readonly description: string;
  readonly recommendation: string | null;
  readonly lineNumbers: readonly number[];
  readonly confidence: string | null;
  readonly confirmed: boolean;
  readonly attackPayload: string | null;
  readonly attackResponse: string | null;
  readonly attackExplanation: string | null;
  readonly createdAt: string;
};

type ScanFindingsResponse = {
  readonly scan: {
    readonly id: string;
    readonly runId: string | null;
    readonly targetUrl: string | null;
    readonly repoUrl: string | null;
    readonly mode: string;
    readonly status: string;
    readonly errorMessage: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly completedAt: string | null;
    readonly overview:
      | {
          readonly summary: string;
          readonly keyPoints: readonly string[];
          readonly remediationPriorities: readonly string[];
          readonly notableFiles: readonly {
            readonly filePath: string;
            readonly findingCount: number;
            readonly topSeverity: string;
          }[];
          readonly model: string;
          readonly generatedAt: string;
        }
      | null;
    readonly overviewError: string | null;
  };
  readonly summary: ScanReportSummary;
  readonly findings: readonly ScanFindingRecord[];
  readonly analysisHistory: readonly {
    readonly filePath: string;
    readonly runId: string;
    readonly investigatedAt: string;
    readonly durationMs: number;
    readonly agentType: string;
    readonly model: string;
    readonly modelConfig: { readonly model?: string };
    readonly agentSessionId: string | null;
    readonly findingCount: number;
    readonly numTurns: number | null;
    readonly phase: string;
    readonly costUsd: number | null;
    readonly usage: TokenUsage;
    readonly refusal: RefusalInfo;
  }[];
};

type FlattenedFinding = {
  readonly key: string;
  readonly filePath: string;
  readonly finding: AgentFinding;
};

type ParsedFindingDetails = {
  readonly fileUrl: string | null;
  readonly suggestedAssignee: string | null;
  readonly findingBody: string;
  readonly recentCommitters: readonly string[];
};

type SeverityFilter = "all" | AgentSeverity;

type SortKey = "severity" | "file" | "title";

const SORT_LABELS: Record<SortKey, string> = {
  severity: "Severity",
  file: "File path",
  title: "Title",
};

const SEVERITY_LABELS: Record<AgentSeverity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
  BUG: "Bug",
  HIGH_BUG: "High · bug",
};

const ALL_SEVERITIES: readonly AgentSeverity[] = [
  "CRITICAL",
  "HIGH",
  "HIGH_BUG",
  "MEDIUM",
  "LOW",
  "INFO",
  "BUG",
];

function createEmptyReport(id: string): SecurityScanReport {
  return {
    projectId: id,
    generatedAt: "",
    runId: null,
    status: "pending",
    errorMessage: null,
    overview: null,
    overviewError: null,
    summary: {
      filesAnalyzed: 0,
      totalFindings: 0,
      critical: 0,
      high: 0,
      medium: 0,
      highBug: 0,
      bug: 0,
    },
    files: [],
  };
}

function toSeverity(severity: string): AgentSeverity {
  if (ALL_SEVERITIES.includes(severity as AgentSeverity)) {
    return severity as AgentSeverity;
  }
  return "INFO";
}

function toConfidenceLevel(confidence: string | null): ConfidenceLevel {
  if (
    confidence === "high" ||
    confidence === "medium" ||
    confidence === "low"
  ) {
    return confidence;
  }
  return "low";
}

function toSecurityScanReport(data: ScanFindingsResponse): SecurityScanReport {
  const files = new Map<string, AgentFinding[]>();
  const historyByFile = new Map<string, AnalysisHistoryEntry[]>();

  for (const finding of data.findings) {
    const fileFindings = files.get(finding.filePath) ?? [];
    fileFindings.push({
      severity: toSeverity(finding.severity),
      vulnSlug: finding.vulnSlug,
      title: finding.title,
      description: finding.description,
      lineNumbers: finding.lineNumbers,
      recommendation: finding.recommendation ?? "",
      confidence: toConfidenceLevel(finding.confidence),
      producedByRunId: data.scan.id,
    });
    files.set(finding.filePath, fileFindings);
  }

  for (const entry of data.analysisHistory) {
    const fileHistory = historyByFile.get(entry.filePath) ?? [];
    fileHistory.push({
      runId: entry.runId,
      investigatedAt: entry.investigatedAt,
      durationMs: entry.durationMs,
      agentType: entry.agentType,
      model: entry.model,
      modelConfig: { model: entry.modelConfig.model ?? entry.model },
      agentSessionId: entry.agentSessionId ?? "",
      findingCount: entry.findingCount,
      numTurns: entry.numTurns ?? 0,
      phase: entry.phase,
      costUsd: entry.costUsd ?? 0,
      usage: entry.usage,
      refusal: entry.refusal,
    });
    historyByFile.set(entry.filePath, fileHistory);
  }

  return {
    projectId: data.scan.repoUrl ?? data.scan.targetUrl ?? data.scan.id,
    generatedAt:
      data.scan.completedAt ?? data.scan.updatedAt ?? data.scan.createdAt,
    runId: data.scan.runId,
    status: data.scan.status,
    errorMessage: data.scan.errorMessage,
    overview: data.scan.overview,
    overviewError: data.scan.overviewError,
    summary: data.summary,
    files: Array.from(
      new Set([...files.keys(), ...historyByFile.keys()]).values(),
    ).map((filePath) => ({
      filePath,
      findings: files.get(filePath) ?? [],
      analysisHistory: historyByFile.get(filePath) ?? [],
    })),
  };
}

async function fetchScanReport(id: string): Promise<SecurityScanReport> {
  const res = await fetch(`/api/scans/${encodeURIComponent(id)}/findings`);

  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(json?.error ?? "Failed to load scan findings");
  }

  const json = (await res.json()) as ScanFindingsResponse;
  return toSecurityScanReport(json);
}

function severityBadgeClass(severity: AgentSeverity): string {
  if (severity === "CRITICAL")
    return "border-destructive/40 bg-destructive/10 text-destructive";
  if (severity === "HIGH" || severity === "HIGH_BUG")
    return "border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-400";
  if (severity === "MEDIUM")
    return "border-amber-500/50 bg-amber-400/15 text-amber-900 dark:text-amber-200";
  if (severity === "BUG")
    return "border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-300";
  return "border-border bg-muted text-muted-foreground";
}

function severityRank(severity: AgentSeverity): number {
  const order: Record<AgentSeverity, number> = {
    CRITICAL: 0,
    HIGH: 1,
    HIGH_BUG: 2,
    MEDIUM: 3,
    LOW: 4,
    INFO: 5,
    BUG: 6,
  };
  return order[severity];
}

function formatIsoLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}m ${rem.toFixed(0)}s`;
}

function cleanMarkdownishText(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseFindingDetails(finding: AgentFinding): ParsedFindingDetails {
  const description = finding.description;
  const fileUrlMatch = description.match(
    /\*\*File:\*\*\s*\[`[^`]+`\]\(([^)]+)\)/,
  );
  const assigneeMatch = description.match(
    /\*\*Suggested assignee:\*\*\s*`([^`]+)`/,
  );
  const findingSectionMatch = description.match(
    /## Finding\s*([\s\S]*?)(?:\n## Recommendation|\n## Recent committers|$)/,
  );
  const committerBlockMatch = description.match(
    /## Recent committers \(`git log`\)\s*([\s\S]*)$/,
  );

  const recentCommitters = (committerBlockMatch?.[1] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));

  return {
    fileUrl: fileUrlMatch?.[1] ?? null,
    suggestedAssignee: assigneeMatch?.[1] ?? null,
    findingBody: cleanMarkdownishText(findingSectionMatch?.[1] ?? description),
    recentCommitters,
  };
}

function flattenFindings(report: SecurityScanReport): FlattenedFinding[] {
  const out: FlattenedFinding[] = [];
  for (const file of report.files) {
    file.findings.forEach((finding, index) => {
      out.push({
        key: `${file.filePath}:${finding.vulnSlug}:${index}`,
        filePath: file.filePath,
        finding,
      });
    });
  }
  return out;
}

type HistoryRow = {
  readonly key: string;
  readonly filePath: string;
  readonly entry: AnalysisHistoryEntry;
};

function flattenHistory(report: SecurityScanReport): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const file of report.files) {
    for (const entry of file.analysisHistory) {
      rows.push({
        key: `${file.filePath}:${entry.runId}:${entry.investigatedAt}`,
        filePath: file.filePath,
        entry,
      });
    }
  }
  rows.sort(
    (a, b) =>
      new Date(b.entry.investigatedAt).getTime() -
      new Date(a.entry.investigatedAt).getTime(),
  );
  return rows;
}

function FindingCard({
  item,
  defaultOpen,
}: {
  item: FlattenedFinding;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const { finding, filePath } = item;
  const lines =
    finding.lineNumbers.length > 0 ? finding.lineNumbers.join(", ") : "—";
  const details = React.useMemo(() => parseFindingDetails(finding), [finding]);

  return (
    <li>
      <div className="hover:bg-muted/40 border-border bg-background border transition-colors">
        <div className="grid grid-cols-1 gap-2 px-3 py-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-start md:gap-4">
          <Badge
            variant="outline"
            className={cn(
              "h-5 w-fit shrink-0 rounded-none border px-1.5 py-0 text-[10px] font-medium tracking-tight",
              severityBadgeClass(finding.severity),
            )}
          >
            {SEVERITY_LABELS[finding.severity]}
          </Badge>
          <div className="min-w-0 space-y-1">
            <p className="font-serif text-sm font-medium leading-snug tracking-tight">
              {finding.title}
            </p>
            <p className="text-muted-foreground font-mono text-[11px] leading-relaxed break-all">
              {details.fileUrl ? (
                <a
                  href={details.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground underline underline-offset-2"
                >
                  {filePath}
                </a>
              ) : (
                filePath
              )}
            </p>
            <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px]">
              <span>
                <span className="text-foreground/80">slug</span>{" "}
                {finding.vulnSlug}
              </span>
              <span>
                <span className="text-foreground/80">lines</span> {lines}
              </span>
              <span>
                <span className="text-foreground/80">confidence</span>{" "}
                {finding.confidence}
              </span>
              <span className="truncate" title={finding.producedByRunId}>
                <span className="text-foreground/80">run</span>{" "}
                {finding.producedByRunId}
              </span>
              {details.suggestedAssignee ? (
                <span className="truncate" title={details.suggestedAssignee}>
                  <span className="text-foreground/80">owner</span>{" "}
                  {details.suggestedAssignee}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="border-border border-t px-3 py-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            {open ? "Hide details" : "Show details"}
          </button>
          {open ? (
            <div className="mt-3 space-y-3 text-xs leading-relaxed">
              <div>
                <p className="text-foreground/90 mb-1 font-medium">
                  Description
                </p>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {details.findingBody}
                </p>
              </div>
              <div>
                <p className="text-foreground/90 mb-1 font-medium">
                  Recommendation
                </p>
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {finding.recommendation}
                </p>
              </div>
              {details.recentCommitters.length > 0 ? (
                <div>
                  <p className="text-foreground/90 mb-1 font-medium">
                    Recent committers
                  </p>
                  <ul className="text-muted-foreground space-y-1">
                    {details.recentCommitters.map((committer) => (
                      <li key={committer}>{committer}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default function ScanDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id ?? "");
  const queryClient = useQueryClient();
  const emptyReport = React.useMemo(() => createEmptyReport(id), [id]);

  const {
    data: report = emptyReport,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["scan-findings", id],
    queryFn: () => fetchScanReport(id),
    enabled: id.length > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" ||
        status === "cloning" ||
        status === "scanning" ||
        status === "ingesting" ||
        status === "attacking"
        ? 3000
        : false;
    },
  });

  React.useEffect(() => {
    if (!id) return;

    const source = new EventSource(
      `/api/scans/${encodeURIComponent(id)}/events`,
    );

    source.onmessage = () => {
      void queryClient.invalidateQueries({ queryKey: ["scan-findings", id] });
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [id, queryClient]);

  const [repoTab, setRepoTab] = React.useState<
    "triage" | "history" | "overview"
  >("triage");
  const [severityFilter, setSeverityFilter] =
    React.useState<SeverityFilter>("all");
  const [sortKey, setSortKey] = React.useState<SortKey>("severity");
  const [query, setQuery] = React.useState("");

  const allFindings = React.useMemo(() => flattenFindings(report), [report]);

  const historyRows = React.useMemo(() => flattenHistory(report), [report]);

  const filteredFindings = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...allFindings];

    if (severityFilter !== "all") {
      list = list.filter((f) => f.finding.severity === severityFilter);
    }
    if (q.length > 0) {
      list = list.filter((f) => {
        const hay = [
          f.filePath,
          f.finding.title,
          f.finding.description,
          f.finding.vulnSlug,
          f.finding.recommendation,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    list.sort((a, b) => {
      if (sortKey === "severity") {
        const diff =
          severityRank(a.finding.severity) - severityRank(b.finding.severity);
        if (diff !== 0) return diff;
        return a.filePath.localeCompare(b.filePath);
      }
      if (sortKey === "file") {
        const fp = a.filePath.localeCompare(b.filePath);
        if (fp !== 0) return fp;
        return a.finding.title.localeCompare(b.finding.title);
      }
      return a.finding.title.localeCompare(b.finding.title);
    });

    return list;
  }, [allFindings, query, severityFilter, sortKey]);

  const { summary } = report;

  return (
    <div className="bg-background text-foreground flex min-h-0 flex-1 flex-col">
      <div className="border-border px-8 py-6">
        <Link
          href="/scans"
          className="text-muted-foreground mb-4 inline-block text-sm hover:underline"
        >
          ← Scans
        </Link>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground font-mono text-sm break-all">
            {id}
          </p>
          <Tabs
            value={repoTab}
            onValueChange={(v) => {
              if (v === "triage" || v === "history" || v === "overview") {
                setRepoTab(v);
              }
            }}
            className="mt-4 gap-4"
          >
            <TabsList variant="line" className="w-fit -ml-1">
              <TabsTrigger value="triage" className="flex-none">
                Findings
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-none">
                Analysis history
              </TabsTrigger>
              <TabsTrigger value="overview" className="flex-none">
                Run overview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="triage" className="mt-0">
              {isLoading ? (
                <p className="text-muted-foreground text-sm">
                  Loading findings…
                </p>
              ) : null}

              {error ? (
                <p className="text-destructive text-sm">
                  {error instanceof Error ? error.message : "Unknown error"}
                </p>
              ) : null}

              <div className="flex flex-col gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Security scan
                </h1>
                <p className="text-muted-foreground text-sm">
                  Report{" "}
                  <span className="text-foreground font-mono text-xs">
                    {report.projectId}
                  </span>
                  {" · "}
                  generated {formatIsoLocal(report.generatedAt)}
                  {report.runId !== null ? (
                    <>
                      {" · "}
                      run{" "}
                      <span className="font-mono text-xs">{report.runId}</span>
                    </>
                  ) : null}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                  <div className="border-border bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground text-[10px] uppercase">
                      Files
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {summary.filesAnalyzed}
                    </p>
                  </div>
                  <div className="border-border bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground text-[10px] uppercase">
                      Findings
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {summary.totalFindings}
                    </p>
                  </div>
                  <div className="border-border bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground text-[10px] uppercase">
                      Critical
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {summary.critical}
                    </p>
                  </div>
                  <div className="border-border bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground text-[10px] uppercase">
                      High
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {summary.high}
                    </p>
                  </div>
                  <div className="border-border bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground text-[10px] uppercase">
                      Medium
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {summary.medium}
                    </p>
                  </div>
                  <div className="border-border bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground text-[10px] uppercase">
                      High bug
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {summary.highBug}
                    </p>
                  </div>
                  <div className="border-border bg-muted/30 px-3 py-2">
                    <p className="text-muted-foreground text-[10px] uppercase">
                      Bug
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {summary.bug}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center mt-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(
                        buttonVariants({
                          variant: "outline",
                          size: "default",
                        }),
                        "w-full justify-between gap-2 sm:w-[11rem]",
                      )}
                    >
                      Severity:{" "}
                      {severityFilter === "all"
                        ? "All"
                        : SEVERITY_LABELS[severityFilter]}
                      <CaretDownIcon className="text-muted-foreground size-4 shrink-0" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="min-w-[11rem]"
                    >
                      <DropdownMenuItem
                        onClick={() => setSeverityFilter("all")}
                        className="cursor-pointer"
                      >
                        All
                      </DropdownMenuItem>
                      {ALL_SEVERITIES.map((sev) => (
                        <DropdownMenuItem
                          key={sev}
                          onClick={() => setSeverityFilter(sev)}
                          className="cursor-pointer"
                        >
                          {SEVERITY_LABELS[sev]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(
                        buttonVariants({
                          variant: "outline",
                          size: "default",
                        }),
                        "w-full justify-between gap-2 sm:w-[11rem]",
                      )}
                    >
                      Sort: {SORT_LABELS[sortKey]}
                      <CaretDownIcon className="text-muted-foreground size-4 shrink-0" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="min-w-[11rem]"
                    >
                      {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                        <DropdownMenuItem
                          key={key}
                          onClick={() => setSortKey(key)}
                          className="cursor-pointer"
                        >
                          {SORT_LABELS[key]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="relative min-w-0 flex-1 sm:max-w-md">
                  <MagnifyingGlassIcon
                    className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search title, path, slug, description…"
                    className="pl-8"
                  />
                </div>
              </div>

              <ul
                className="flex flex-col gap-3 mt-4"
                aria-label="Security findings"
              >
                {filteredFindings.map((item) => (
                  <FindingCard
                    key={item.key}
                    item={item}
                    defaultOpen={filteredFindings.length <= 3}
                  />
                ))}
              </ul>

              {filteredFindings.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  No findings match your filters.
                </p>
              ) : null}
            </TabsContent>

            <TabsContent value="history" className="mt-0 pt-2">
              <p className="text-muted-foreground mb-4 text-sm">
                Per-file agent runs (phase, model, cost, tokens, refusals).
              </p>
              <ul className="flex flex-col gap-2">
                {historyRows.map((row) => {
                  const { entry } = row;
                  return (
                    <li key={row.key}>
                      <div className="border-border hover:bg-muted/30 grid gap-2 border px-3 py-2 text-xs transition-colors md:grid-cols-[minmax(0,1.2fr)_auto] md:items-start md:gap-4">
                        <div className="min-w-0">
                          <p className="text-muted-foreground font-mono text-[11px] break-all">
                            {row.filePath}
                          </p>
                          <p className="text-foreground mt-1 font-medium">
                            {entry.agentType} · {entry.model} · {entry.phase}
                          </p>
                          <p className="text-muted-foreground mt-0.5">
                            {formatIsoLocal(entry.investigatedAt)} ·{" "}
                            {formatDurationMs(entry.durationMs)}
                          </p>
                        </div>
                        <div className="text-muted-foreground grid shrink-0 grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] md:text-right">
                          <span>
                            findings{" "}
                            <span className="text-foreground">
                              {entry.findingCount}
                            </span>
                          </span>
                          <span>
                            cost{" "}
                            <span className="text-foreground">
                              {formatUsd(entry.costUsd)}
                            </span>
                          </span>
                          <span className="col-span-2 md:col-span-1">
                            in / out{" "}
                            <span className="text-foreground">
                              {Math.round(entry.usage.inputTokens)} /{" "}
                              {Math.round(entry.usage.outputTokens)}
                            </span>
                          </span>
                          <span className="col-span-2 md:col-span-1">
                            cache read{" "}
                            <span className="text-foreground">
                              {Math.round(entry.usage.cacheReadInputTokens)}
                            </span>
                          </span>
                          <span className="col-span-2">
                            refused{" "}
                            <span className="text-foreground">
                              {entry.refusal.refused ? "yes" : "no"}
                            </span>
                            {entry.refusal.skipped.length > 0
                              ? ` · skipped: ${entry.refusal.skipped.join(", ")}`
                              : null}
                          </span>
                          <span
                            className="text-muted-foreground/80 col-span-2 truncate md:text-right"
                            title={entry.runId}
                          >
                            run {entry.runId}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </TabsContent>

            <TabsContent value="overview" className="mt-0 pt-2">
              {report.overview ? (
                <div className="max-w-3xl space-y-6 text-sm">
                  <div className="space-y-2">
                    <p className="text-base leading-7 whitespace-pre-wrap">
                      {report.overview.summary}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Generated {formatIsoLocal(report.overview.generatedAt)} with{" "}
                      <span className="font-mono">{report.overview.model}</span>
                    </p>
                  </div>

                  {report.overview.keyPoints.length > 0 ? (
                    <div>
                      <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                        Key points
                      </h2>
                      <ul className="space-y-2">
                        {report.overview.keyPoints.map((point) => (
                          <li
                            key={point}
                            className="border-border bg-muted/20 border px-3 py-2"
                          >
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {report.overview.remediationPriorities.length > 0 ? (
                    <div>
                      <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                        Remediation priorities
                      </h2>
                      <ul className="space-y-2">
                        {report.overview.remediationPriorities.map((item) => (
                          <li key={item} className="border-border border px-3 py-2">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {report.overview.notableFiles.length > 0 ? (
                    <div>
                      <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
                        Notable files
                      </h2>
                      <ul className="space-y-2">
                        {report.overview.notableFiles.map((file) => (
                          <li
                            key={file.filePath}
                            className="border-border grid gap-2 border px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
                          >
                            <p className="font-mono text-xs break-all">
                              {file.filePath}
                            </p>
                            <div className="text-muted-foreground flex gap-3 font-mono text-[11px]">
                              <span>{file.findingCount} findings</span>
                              <span>{file.topSeverity}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {report.overviewError ? (
                    <p className="text-muted-foreground text-xs">
                      Overview fallback used: {report.overviewError}
                    </p>
                  ) : null}
                </div>
              ) : (
                <dl className="grid max-w-lg gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground text-xs uppercase">
                      Project ID
                    </dt>
                    <dd className="font-mono text-xs">{report.projectId}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs uppercase">
                      Generated at
                    </dt>
                    <dd>{formatIsoLocal(report.generatedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs uppercase">
                      Run ID
                    </dt>
                    <dd className="font-mono text-xs">
                      {report.runId ?? "— (null in payload)"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs uppercase">
                      Overview status
                    </dt>
                    <dd>{report.overviewError ?? "Pending generation"}</dd>
                  </div>
                </dl>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

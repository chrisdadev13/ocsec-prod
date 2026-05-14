"use client";

import {
  CaretDownIcon,
  MagnifyingGlassIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { useNewScanDialog } from "@/components/providers";
import { cn } from "@/lib/utils";

type ScanStatus =
  | "pending"
  | "cloning"
  | "scanning"
  | "ingesting"
  | "attacking"
  | "completed"
  | "failed";

type ScanMode = "blackbox" | "greybox";

type Scan = {
  id: string;
  targetUrl: string | null;
  repoUrl: string | null;
  mode: ScanMode;
  status: ScanStatus;
  filesAnalyzed: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type StatusFilter = "all" | ScanStatus;
type ModeFilter = "all" | ScanMode;
type SortKey = "recent" | "target" | "severity" | "files";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently updated",
  target: "Target URL",
  severity: "Severity count",
  files: "Files analyzed",
};

const STATUS_LABELS: Record<ScanStatus, string> = {
  pending: "Pending",
  cloning: "Cloning",
  scanning: "Scanning",
  ingesting: "Ingesting",
  attacking: "Attacking",
  completed: "Completed",
  failed: "Failed",
};

const MODE_LABELS: Record<ScanMode, string> = {
  blackbox: "Blackbox",
  greybox: "Greybox",
};

function scanHref(scanId: string): string {
  return `/scans/${encodeURIComponent(scanId)}`;
}

function shortRelative(past: Date): string {
  const minutes = Math.floor((Date.now() - past.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function statusBadgeClass(status: ScanStatus): string {
  switch (status) {
    case "completed":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "failed":
      return "border-destructive/40 bg-destructive/10 text-destructive";
    case "attacking":
      return "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-400";
    case "scanning":
      return "border-amber-500/40 bg-amber-400/15 text-amber-900 dark:text-amber-200";
    case "ingesting":
      return "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
    case "cloning":
      return "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400";
    case "pending":
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function severityTotal(scan: Scan): number {
  return scan.criticalCount + scan.highCount + scan.mediumCount + scan.lowCount;
}

function scanLabel(scan: Pick<Scan, "repoUrl" | "targetUrl">): string {
  return scan.repoUrl ?? scan.targetUrl ?? "Unknown target";
}

export default function ScansPage() {
  const [scans, setScans] = React.useState<Scan[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [mode, setMode] = React.useState<ModeFilter>("all");
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("recent");
  const { setOpen } = useNewScanDialog();

  React.useEffect(() => {
    async function fetchScans() {
      try {
        setLoading(true);
        const res = await fetch("/api/scans");
        if (!res.ok) {
          throw new Error("Failed to fetch scans");
        }
        const data = await res.json();
        setScans(data.scans.map((s: Scan & { createdAt: string; updatedAt: string }) => ({
          ...s,
          createdAt: new Date(s.createdAt),
          updatedAt: new Date(s.updatedAt),
        })));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    fetchScans();
  }, []);

  const counts = React.useMemo(() => {
    const total = scans.length;
    const pending = scans.filter((s) => s.status === "pending").length;
    const running = scans.filter((s) =>
      ["cloning", "scanning", "ingesting", "attacking"].includes(s.status),
    ).length;
    const completed = scans.filter((s) => s.status === "completed").length;
    const failed = scans.filter((s) => s.status === "failed").length;
    return { total, pending, running, completed, failed };
  }, [scans]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...scans];
    if (status !== "all") {
      list = list.filter((s) => s.status === status);
    }
    if (mode !== "all") {
      list = list.filter((s) => s.mode === mode);
    }
    if (q.length > 0) {
      list = list.filter((s) => {
        const hay = `${scanLabel(s)} ${s.status}`.toLowerCase();
        return hay.includes(q);
      });
    }
    list.sort((a, b) => {
      if (sortKey === "target") {
        return scanLabel(a).localeCompare(scanLabel(b));
      }
      if (sortKey === "severity") {
        const sa = severityTotal(a);
        const sb = severityTotal(b);
        if (sb !== sa) return sb - sa;
      }
      if (sortKey === "files") {
        if (b.filesAnalyzed !== a.filesAnalyzed)
          return b.filesAnalyzed - a.filesAnalyzed;
      }
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
    return list;
  }, [query, sortKey, status, mode, scans]);

  return (
    <div className="bg-background text-foreground flex min-h-0 flex-1">
      <main className="min-w-0 flex-1 px-8 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Scans</h1>
            <p className="text-muted-foreground text-sm">
              View and manage your security scans
            </p>
          </div>
        </div>
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="relative min-w-0 flex-1">
              <MagnifyingGlassIcon
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by target URL, status…"
                className="pl-8"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  buttonVariants({ variant: "outline", size: "default" }),
                  "w-full justify-between gap-2 sm:w-auto",
                )}
              >
                {SORT_LABELS[sortKey]}
                <CaretDownIcon className="text-muted-foreground size-4 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStatus("all")}
              className={cn(
                "h-8",
                status === "all" && "bg-muted text-foreground border-foreground/20",
              )}
            >
              All ({counts.total})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStatus(status === "pending" ? "all" : "pending")}
              className={cn(
                "h-8",
                status === "pending" && "bg-muted text-foreground border-foreground/20",
              )}
            >
              Pending ({counts.pending})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStatus(status === "completed" ? "all" : "completed")}
              className={cn(
                "h-8",
                status === "completed" && "bg-muted text-foreground border-foreground/20",
              )}
            >
              Completed ({counts.completed})
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStatus(status === "failed" ? "all" : "failed")}
              className={cn(
                "h-8",
                status === "failed" && "bg-muted text-foreground border-foreground/20",
              )}
            >
              Failed ({counts.failed})
            </Button>
          </div>
        </div>

        {!loading && !error && filtered.length > 0 && (
          <ul aria-label="Scan list" className="flex flex-col gap-3">
            {filtered.map((scan) => (
              <li key={scan.id}>
                <Link
                  href={scanHref(scan.id)}
                  className="hover:bg-muted/50 border border-border focus-visible:ring-ring flex flex-col gap-3 p-4 outline-none transition-colors focus-visible:ring-2 md:flex-row md:items-center md:gap-6"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold truncate">
                        {scanLabel(scan)}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 rounded-none border px-1.5 py-0 text-[10px] font-medium tracking-tight",
                          statusBadgeClass(scan.status),
                        )}
                      >
                        {STATUS_LABELS[scan.status]}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-muted-foreground h-5 rounded-none border px-1.5 py-0 text-[10px] font-medium tracking-tight"
                      >
                        {MODE_LABELS[scan.mode]}
                      </Badge>
                    </div>
                    {scan.repoUrl ? (
                      <p className="text-muted-foreground mt-1 truncate text-xs font-mono">
                        {scan.repoUrl}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-muted-foreground flex shrink-0 flex-wrap items-center gap-3 text-xs">
                    {scan.filesAnalyzed > 0 ? (
                      <span className="tabular-nums">
                        <span className="text-foreground/70">files</span>{" "}
                        {scan.filesAnalyzed}
                      </span>
                    ) : null}
                    {severityTotal(scan) > 0 ? (
                      <div className="flex items-center gap-1.5">
                        {scan.criticalCount > 0 ? (
                          <span className="text-destructive tabular-nums font-medium">
                            C {scan.criticalCount}
                          </span>
                        ) : null}
                        {scan.highCount > 0 ? (
                          <span className="text-orange-600 dark:text-orange-400 tabular-nums font-medium">
                            H {scan.highCount}
                          </span>
                        ) : null}
                        {scan.mediumCount > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400 tabular-nums font-medium">
                            M {scan.mediumCount}
                          </span>
                        ) : null}
                        {scan.lowCount > 0 ? (
                          <span className="text-muted-foreground tabular-nums">
                            L {scan.lowCount}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground/60">
                        No findings
                      </span>
                    )}
                    <span className="tabular-nums">
                      {shortRelative(scan.updatedAt)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {loading ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            Loading scans...
          </p>
        ) : error ? (
          <p className="text-destructive py-12 text-center text-sm">
            {error}
          </p>
        ) : filtered.length === 0 ? (
            scans.length === 0 ? (
              <Empty className="py-16">
                <EmptyMedia variant="icon">
                  <MagnifyingGlassIcon className="size-10 text-muted-foreground" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No scans yet</EmptyTitle>
                  <EmptyDescription>
                    Run your first security scan to discover vulnerabilities in your targets.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    size="sm"
                    onClick={() => setOpen(true)}
                  >
                    <PlusIcon className="size-4 mr-1.5" />
                    Start a scan
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <p className="text-muted-foreground py-12 text-center text-sm">
                No scans match your filters.
              </p>
            )
          ) : null}
      </main>
    </div>
  );
}

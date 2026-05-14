"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import Image from "next/image";

interface RepoOwner {
  id: number;
  login: string;
  avatar_url: string;
}

interface Repo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  owner: RepoOwner;
}

async function fetchRepos(): Promise<Repo[]> {
  const res = await fetch("/api/github/repos");
  if (!res.ok) throw new Error("Failed to load repositories");
  const json = await res.json();
  return json.repos ?? [];
}

interface RepoPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RepoPickerDialog({ open, onOpenChange }: RepoPickerDialogProps) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [startingRepoId, setStartingRepoId] = React.useState<number | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const {
    data: repos = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["github-repos"],
    queryFn: fetchRepos,
    enabled: open,
  });

  const filteredRepos = repos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(search.toLowerCase()) ||
      repo.full_name.toLowerCase().includes(search.toLowerCase()),
  );

  async function startScan(repo: Repo) {
    try {
      setStartingRepoId(repo.id);
      setSubmitError(null);

      const res = await fetch("/api/scans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoUrl: repo.html_url,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { error?: string; scan?: { id: string } }
        | null;

      if (!res.ok || !json?.scan?.id) {
        throw new Error(json?.error ?? "Failed to start scan");
      }

      onOpenChange(false);
      setSearch("");
      router.push(`/scans/${encodeURIComponent(json.scan.id)}`);
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to start scan");
    } finally {
      setStartingRepoId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Your Repositories</DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Search repositories..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (submitError) {
              setSubmitError(null);
            }
          }}
          className="mb-3"
        />

        {submitError && (
          <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {submitError}
          </div>
        )}

        {isLoading && (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        )}

        {error && (
          <div className="py-4 text-center text-destructive">
            {error instanceof Error ? error.message : "Unknown error"}
          </div>
        )}

        {!isLoading && !error && repos.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            No repositories found.
          </div>
        )}

        {!isLoading && !error && filteredRepos.length === 0 && repos.length > 0 && (
          <div className="py-8 text-center text-muted-foreground">
            No results for &quot;{search}&quot;.
          </div>
        )}

        {!isLoading && filteredRepos.length > 0 && (
          <ScrollArea className="w-full max-h-[60vh]" hideScrollBar>
            <div className="w-full divide-y divide-border">
              {filteredRepos.map((repo) => (
                <div
                  key={repo.id}
                  className="flex w-full items-center justify-between gap-3 py-3"
                >
                  <div className="relative shrink-0 size-8 overflow-hidden rounded-md bg-muted">
                    <Image
                      src={repo.owner.avatar_url}
                      alt={repo.owner.login}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="w-0 min-w-0 flex-1 shrink-0 overflow-hidden">
                    <p className="truncate text-sm font-medium">{repo.name}</p>
                    {repo.description && (
                      <p className="truncate text-[10px] leading-tight text-muted-foreground">
                        {repo.description}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="xs"
                    className="shrink-0"
                    disabled={startingRepoId !== null}
                    onClick={() => startScan(repo)}
                  >
                    {startingRepoId === repo.id ? "Starting..." : "Scan"}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

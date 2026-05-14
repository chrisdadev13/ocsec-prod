import { getScanById, updateScan, updateScanStatus } from "@/lib/db/scan";
import { ingestAnalysisArtifacts, ingestFindingsJson } from "@/lib/scans/ingest";
import { generateAndStoreScanOverview } from "@/lib/scans/overview";
import {
  bootstrapDeepsec,
  cloneRepository,
  getGitHubTokenForUser,
  readDeepsecAnalysisArtifacts,
  readDeepsecFindingsJson,
  runDeepsecPipeline,
  verifySandboxRuntime,
} from "@/lib/scans/runner";

export async function runScanWorkflow(scanId: string) {
  "use workflow";

  try {
    const scan = await loadScan(scanId);

    if (!scan.repoUrl) {
      throw new Error("Repository URL is required for repo scans");
    }

    const githubToken = await resolveGitHubToken(scan.userId);

    await transitionScan(scanId, "cloning");
    await verifyRuntime(scanId);

    const repoDir = await cloneRepo(scanId, scan.repoUrl, githubToken);

    await setupDeepsec(scanId, repoDir);

    await transitionScan(scanId, "scanning");
    await runDeepsec(scanId, repoDir);

    await transitionScan(scanId, "ingesting");
    const analysisArtifacts = await readAnalysisArtifacts(scanId, repoDir);
    const findingsJson = await readFindingsJson(scanId, repoDir);
    await ingestAnalysisHistory(scanId, analysisArtifacts);
    await ingestFindings(scanId, findingsJson);
    await generateOverview(scanId, scan.repoUrl ?? scan.targetUrl ?? scan.id);

    await completeScan(scanId);

    return {
      scanId,
      status: "completed" as const,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow failed";
    await failScan(scanId, message);
    throw error;
  }
}

async function loadScan(scanId: string) {
  "use step";

  const scan = await getScanById(scanId);

  if (!scan) {
    throw new Error(`Scan ${scanId} not found`);
  }

  return scan;
}

async function resolveGitHubToken(userId: string) {
  "use step";

  return getGitHubTokenForUser(userId);
}

async function verifyRuntime(scanId: string) {
  "use step";

  await verifySandboxRuntime(scanId);
}

async function cloneRepo(scanId: string, repoUrl: string, githubToken: string) {
  "use step";

  return cloneRepository(scanId, repoUrl, githubToken);
}

async function setupDeepsec(scanId: string, repoDir: string) {
  "use step";

  await bootstrapDeepsec(scanId, repoDir);
}

async function runDeepsec(scanId: string, repoDir: string) {
  "use step";

  await runDeepsecPipeline(scanId, repoDir);
}

async function readFindingsJson(scanId: string, repoDir: string) {
  "use step";

  return readDeepsecFindingsJson(scanId, repoDir);
}

async function readAnalysisArtifacts(scanId: string, repoDir: string) {
  "use step";

  return readDeepsecAnalysisArtifacts(scanId, repoDir);
}

async function ingestFindings(scanId: string, findingsJson: string) {
  "use step";

  await ingestFindingsJson(scanId, findingsJson);
}

async function ingestAnalysisHistory(scanId: string, analysisArtifacts: Awaited<ReturnType<typeof readDeepsecAnalysisArtifacts>>) {
  "use step";

  await ingestAnalysisArtifacts(scanId, analysisArtifacts);
}

async function generateOverview(scanId: string, projectId: string) {
  "use step";

  try {
    await generateAndStoreScanOverview(scanId, projectId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Overview generation failed";
    await updateScan(scanId, {
      overviewError: message,
      updatedAt: new Date(),
    });
  }
}

async function transitionScan(
  scanId: string,
  status: "cloning" | "scanning" | "ingesting",
) {
  "use step";

  const scan = await updateScanStatus(scanId, status);

  if (!scan) {
    throw new Error(`Scan ${scanId} not found`);
  }

  return scan;
}

async function completeScan(scanId: string) {
  "use step";

  const scan = await updateScan(scanId, {
    status: "completed",
    errorMessage: null,
    completedAt: new Date(),
    updatedAt: new Date(),
  });

  if (!scan) {
    throw new Error(`Scan ${scanId} not found`);
  }

  return scan;
}

async function failScan(scanId: string, message: string) {
  "use step";

  await updateScan(scanId, {
    status: "failed",
    errorMessage: message,
    updatedAt: new Date(),
  });
}

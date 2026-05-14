import "server-only";

import { getGitHubAccount } from "@/lib/github";
import { ensureSandbox } from "@/lib/sandbox/client";

const SANDBOX_CONFIG = {
  cpus: 2,
  ramMB: 4096,
  storageGB: 20,
};

const MAX_BUFFER_BYTES = 50 * 1024 * 1024;
const PNPM = "corepack pnpm";
const DEFAULT_DEEPSEC_AGENT = "codex";
const DEFAULT_DEEPSEC_MODEL = "gpt-5-mini";

type CommandOptions = {
  cwd?: string;
  env?: Record<string, string>;
};

export type DeepsecAnalysisHistoryEntry = {
  filePath: string;
  analysisHistory: unknown[];
};

export type DeepsecRunMeta = {
  runId: string;
  phase?: string;
  type?: string;
};

export type DeepsecAnalysisArtifacts = {
  files: DeepsecAnalysisHistoryEntry[];
  runs: DeepsecRunMeta[];
};

function sanitizeNamePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function sanitizeCommandOutput(value: string, secrets: string[] = []) {
  const githubToken = process.env.GITHUB_TOKEN;
  const openAiKey = process.env.OPENAI_API_KEY;
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;

  let output = value;

  for (const secret of [githubToken, openAiKey, gatewayKey, ...secrets]) {
    if (typeof secret === "string" && secret.length > 0) {
      output = output.split(secret).join("[REDACTED]");
    }
  }

  return output;
}

function buildAiEnvironment() {
  const env: Record<string, string> = {};
  const keys = [
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "AI_GATEWAY_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "VERCEL_OIDC_TOKEN",
    "VERCEL_TOKEN",
    "VERCEL_TEAM_ID",
    "VERCEL_PROJECT_ID",
  ] as const;

  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }

  // Some local setups store a direct OpenAI key under AI_GATEWAY_API_KEY.
  // Normalize that so deepsec talks to OpenAI directly instead of failing
  // against Vercel AI Gateway with a non-gateway credential.
  if (!env.OPENAI_API_KEY && env.AI_GATEWAY_API_KEY?.startsWith("sk-")) {
    env.OPENAI_API_KEY = env.AI_GATEWAY_API_KEY;
    delete env.AI_GATEWAY_API_KEY;
  }

  // Prefer direct OpenAI when an explicit API key is present. This avoids
  // accidentally routing Codex through AI Gateway with an incompatible/missing key.
  if (env.OPENAI_API_KEY) {
    if (
      !env.OPENAI_BASE_URL ||
      env.OPENAI_BASE_URL.includes("ai-gateway.vercel.sh")
    ) {
      delete env.OPENAI_BASE_URL;
    }

    delete env.AI_GATEWAY_API_KEY;
  }

  return env;
}

function getDeepsecAgent() {
  return process.env.DEEPSEC_AGENT?.trim() || DEFAULT_DEEPSEC_AGENT;
}

function getDeepsecModel() {
  return process.env.DEEPSEC_MODEL?.trim() || DEFAULT_DEEPSEC_MODEL;
}

function buildDeepsecProcessCommand() {
  const agent = getDeepsecAgent();
  const model = getDeepsecModel();

  return `${PNPM} deepsec process --agent ${JSON.stringify(agent)} --model ${JSON.stringify(model)}`;
}

function assertAiEnvironment(env: Record<string, string>) {
  const hasAiCredential = Boolean(
    env.OPENAI_API_KEY ||
      env.AI_GATEWAY_API_KEY ||
      (env.ANTHROPIC_AUTH_TOKEN && env.ANTHROPIC_BASE_URL) ||
      env.VERCEL_OIDC_TOKEN,
  );

  if (!hasAiCredential) {
    throw new Error(
      "Missing AI credentials. Set OPENAI_API_KEY, AI_GATEWAY_API_KEY, VERCEL_OIDC_TOKEN, or an explicit Anthropic credential pair.",
    );
  }
}

function getCloneUrl(repoUrl: string) {
  const parsed = new URL(repoUrl);
  const pathname = parsed.pathname.replace(/\/+$/, "").replace(/\.git$/, "");

  if (pathname.length <= 1) {
    throw new Error("Invalid repository URL");
  }

  return `${parsed.protocol}//${parsed.host}${pathname}.git`;
}

function getAuthenticatedCloneUrl(repoUrl: string, githubToken: string) {
  const cloneUrl = new URL(getCloneUrl(repoUrl));

  if (cloneUrl.hostname === "github.com") {
    cloneUrl.username = "x-access-token";
    cloneUrl.password = githubToken;
    return cloneUrl.toString();
  }

  cloneUrl.username = githubToken;
  return cloneUrl.toString();
}

function getSandboxName(scanId: string) {
  return sanitizeNamePart(`scan-${scanId}`);
}

function getWorkspaceDir(scanId: string) {
  return `/workspace/${sanitizeNamePart(`scan-${scanId}`)}`;
}

async function execScanCommand(
  scanId: string,
  command: string,
  options: CommandOptions = {},
) {
  const sandbox = await ensureSandbox(getSandboxName(scanId), SANDBOX_CONFIG);

  try {
    return await sandbox.execFile(
      "bash",
      ["-lc", command],
      {
        cwd: options.cwd,
        env: options.env,
        maxBuffer: MAX_BUFFER_BYTES,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Command failed";
    const stdout =
      error && typeof error === "object" && "stdout" in error && typeof error.stdout === "string"
        ? error.stdout
        : "";
    const stderr =
      error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr
        : "";
    const combined = [message, stdout, stderr]
      .filter((part) => part.trim().length > 0)
      .join("\n\n");

    throw new Error(
      sanitizeCommandOutput(combined, Object.values(options.env ?? {})),
    );
  }
}

export async function getGitHubTokenForUser(userId: string) {
  const githubAccount = await getGitHubAccount(userId);

  if (!githubAccount?.accessToken) {
    throw new Error("No GitHub access token found for this user");
  }

  return githubAccount.accessToken;
}

export async function verifySandboxRuntime(scanId: string) {
  await execScanCommand(
    scanId,
    `node --version && corepack --version && ${PNPM} --version && git --version`,
  );
}

export async function cloneRepository(scanId: string, repoUrl: string, githubToken: string) {
  const workspaceDir = getWorkspaceDir(scanId);
  const cloneUrl = getAuthenticatedCloneUrl(repoUrl, githubToken);
  const publicCloneUrl = getCloneUrl(repoUrl);

  await execScanCommand(
    scanId,
    [
      "mkdir -p /workspace",
      `mkdir -p ${JSON.stringify(workspaceDir)}`,
      `rm -rf ${JSON.stringify(workspaceDir)}`,
      `mkdir -p ${JSON.stringify(workspaceDir)}`,
      `cd ${JSON.stringify(workspaceDir)}`,
      "git init",
      `git remote add origin ${JSON.stringify(cloneUrl)}`,
      "git fetch --depth=1 origin HEAD",
      "git checkout FETCH_HEAD",
      `git remote set-url origin ${JSON.stringify(publicCloneUrl)}`,
    ].join(" && "),
    { env: { GITHUB_TOKEN: githubToken } },
  );

  return workspaceDir;
}

export async function bootstrapDeepsec(scanId: string, repoDir: string) {
  await execScanCommand(scanId, "npx deepsec init", { cwd: repoDir });
  await execScanCommand(scanId, `${PNPM} install`, { cwd: `${repoDir}/.deepsec` });
}

export async function runDeepsecPipeline(scanId: string, repoDir: string) {
  const env = buildAiEnvironment();
  assertAiEnvironment(env);
  env.DEEPSEC_INSIDE_SANDBOX = "1";
  env.CODEX_HOME = `${repoDir}/.codex-home`;

  await execScanCommand(scanId, `mkdir -p ${JSON.stringify(env.CODEX_HOME)}`, {
    cwd: repoDir,
    env,
  });

  await execScanCommand(scanId, `${PNPM} deepsec scan`, {
    cwd: `${repoDir}/.deepsec`,
    env,
  });

  await execScanCommand(scanId, buildDeepsecProcessCommand(), {
    cwd: `${repoDir}/.deepsec`,
    env,
  });

  await execScanCommand(
    scanId,
    `${PNPM} deepsec export --format json --out findings.json`,
    {
      cwd: `${repoDir}/.deepsec`,
      env,
    },
  );
}

export async function readDeepsecFindingsJson(scanId: string, repoDir: string) {
  const result = await execScanCommand(
    scanId,
    "node -e 'process.stdout.write(require(\"node:fs\").readFileSync(\"findings.json\", \"utf8\"))'",
    {
      cwd: `${repoDir}/.deepsec`,
    },
  );

  return typeof result.stdout === "string"
    ? result.stdout
    : result.stdout.toString("utf8");
}

export async function readDeepsecAnalysisArtifacts(
  scanId: string,
  repoDir: string,
): Promise<DeepsecAnalysisArtifacts> {
  const readArtifactsScript = String.raw`const fs = require("node:fs");
const path = require("node:path");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(fullPath));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".json")) {
      out.push(fullPath);
    }
  }
  return out;
}

const dataDir = path.join(process.cwd(), ".deepsec", "data");
const projectDirs = fs.existsSync(dataDir)
  ? fs.readdirSync(dataDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dataDir, entry.name))
  : [];

const files = [];
const runs = [];

for (const projectDir of projectDirs) {
  for (const filePath of walk(path.join(projectDir, "files"))) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (typeof parsed?.filePath === "string" && Array.isArray(parsed?.analysisHistory)) {
        files.push({
          filePath: parsed.filePath,
          analysisHistory: parsed.analysisHistory,
        });
      }
    } catch {}
  }

  for (const runPath of walk(path.join(projectDir, "runs"))) {
    try {
      const parsed = JSON.parse(fs.readFileSync(runPath, "utf8"));
      if (typeof parsed?.runId === "string") {
        runs.push({
          runId: parsed.runId,
          phase: typeof parsed?.phase === "string" ? parsed.phase : undefined,
          type: typeof parsed?.type === "string" ? parsed.type : undefined,
        });
      }
    } catch {}
  }
}

process.stdout.write(JSON.stringify({ files, runs }));`;

  const result = await execScanCommand(
    scanId,
    `node <<'EOF'\n${readArtifactsScript}\nEOF`,
    {
      cwd: repoDir,
    },
  );

  const output =
    typeof result.stdout === "string"
      ? result.stdout
      : result.stdout.toString("utf8");

  return JSON.parse(output) as DeepsecAnalysisArtifacts;
}

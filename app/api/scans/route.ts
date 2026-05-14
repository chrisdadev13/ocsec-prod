import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";

import { auth } from "@/lib/auth/config";
import { createScan, getScansByUserId } from "@/lib/db/scan";
import { runScanWorkflow } from "@/workflows/scan";

type CreateScanBody = {
  targetUrl?: unknown;
  repoUrl?: unknown;
};

function parseUrl(value: unknown, fieldName: string): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    throw new Error(`Invalid ${fieldName}`);
  }
}

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const scans = await getScansByUserId(session.user.id);
    return NextResponse.json({ scans });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateScanBody;
    const repoUrl = parseUrl(body.repoUrl, "repo URL");
    const targetUrl = parseUrl(body.targetUrl, "target URL");

    if (!targetUrl && !repoUrl) {
      return NextResponse.json(
        { error: "A target URL or repo URL is required" },
        { status: 400 },
      );
    }

    const scan = await createScan({
      id: crypto.randomUUID(),
      userId: session.user.id,
      targetUrl,
      repoUrl,
      mode: repoUrl ? "greybox" : "blackbox",
      status: "pending",
    });

    await start(runScanWorkflow, [scan.id]);

    return NextResponse.json({ scan }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

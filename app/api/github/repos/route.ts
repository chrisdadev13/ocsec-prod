import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { listReposForUser } from "@/lib/github";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const repos = await listReposForUser(session.user.id);
    return NextResponse.json({ repos });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

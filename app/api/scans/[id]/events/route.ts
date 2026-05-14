import { NextRequest } from "next/server";

import { auth } from "@/lib/auth/config";
import { getFindingsCountByScanId } from "@/lib/db/findings";
import { getScanById } from "@/lib/db/scan";

function getRawFindingTotal(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  const scan = await getScanById(id);

  if (!scan || scan.userId !== session.user.id) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let previous = "";
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        controller.close();
      };

      const write = async () => {
        const nextScan = await getScanById(id);

        if (!nextScan || nextScan.userId !== session.user.id) {
          close();
          return;
        }

        const insertedFindings = await getFindingsCountByScanId(id);
        const payload = JSON.stringify({
          status: nextScan.status,
          errorMessage: nextScan.errorMessage,
          insertedFindings,
          totalFindings: getRawFindingTotal(nextScan.rawFindings),
          updatedAt: nextScan.updatedAt?.toISOString?.() ?? null,
        });

        if (payload !== previous) {
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          previous = payload;
        }

        if (nextScan.status === "completed" || nextScan.status === "failed") {
          close();
        }
      };

      const interval = setInterval(() => {
        void write();
      }, 1000);

      void write();

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

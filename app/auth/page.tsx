import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { AuthPageClient } from "./page-client";

export default async function AuthPage() {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({
    headers: requestHeaders,
  });

  if (session) {
    redirect("/scans");
  }

  return <AuthPageClient />;
}

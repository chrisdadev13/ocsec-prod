import { Octokit } from "@octokit/rest";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { account } from "@/lib/db/schema";

export function createGitHubClient(accessToken: string): Octokit {
  return new Octokit({ auth: accessToken });
}

export async function getGitHubAccount(userId: string) {
  const rows = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "github")))
    .limit(1);

  return rows[0] ?? null;
}

export async function getGitHubClientForUser(userId: string): Promise<Octokit> {
  const githubAccount = await getGitHubAccount(userId);
  if (!githubAccount?.accessToken) {
    throw new Error("No GitHub access token found for this user");
  }
  return createGitHubClient(githubAccount.accessToken);
}

export async function listRepos(client: Octokit) {
  const repos = await client.paginate(client.rest.repos.listForAuthenticatedUser, {
    per_page: 100,
    sort: "updated",
  });
  return repos;
}

export async function listReposForUser(userId: string) {
  const client = await getGitHubClientForUser(userId);
  return listRepos(client);
}

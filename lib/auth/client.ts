import { createAuthClient } from "better-auth/react";

const authClientOptions = process.env.NEXT_PUBLIC_BETTER_AUTH_URL
  ? { baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL }
  : typeof window !== "undefined"
    ? { baseURL: window.location.origin }
    : {};

export const authClient = createAuthClient({
  ...authClientOptions,
});

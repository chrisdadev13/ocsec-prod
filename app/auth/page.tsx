"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GithubLogo } from "@phosphor-icons/react";

export default function AuthPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Welcome</CardTitle>
          <CardDescription>Sign in or create an account to continue</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => authClient.signIn.social({ provider: "github" })}
          >
            <GithubLogo className="size-4" />
            Continue with GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
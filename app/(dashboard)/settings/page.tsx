import type { ReactNode } from "react";

import { ArrowsClockwiseIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

function SettingsSection({
  title,
  description,
  children,
  danger = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={[
        "border border-dotted px-4 py-4 sm:px-5 sm:py-5",
        danger ? "border-destructive/70" : "border-border",
      ].join(" ")}
    >
      <div className="max-w-3xl space-y-1.5">
        <h2 className="text-sm font-medium tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <div className="bg-background text-foreground flex min-h-0 flex-1">
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mb-6">
          <h1 className="text-base font-medium tracking-tight">Account</h1>
        </div>

        <div className="space-y-6">
          <SettingsSection
            title="Full Name"
            description="Your full name as it will appear across the platform."
          >
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Input
                defaultValue="Chris Pacheco"
                className="h-10 text-sm sm:flex-1"
              />
              <Button className="h-10 px-4 text-sm sm:self-end">Save</Button>
            </div>
          </SettingsSection>

          <SettingsSection
            title="Email Address"
            description="The email address associated with your account."
          >
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <Input
                type="email"
                defaultValue="chris.dicto@gmail.com"
                className="h-10 text-sm sm:flex-1"
              />
              <Button className="h-10 px-4 text-sm sm:self-end">Save</Button>
            </div>
          </SettingsSection>

          <SettingsSection
            title="API Key"
            description="Your personal API key for accessing the OCSec API and from the CLI."
          >
            <div className="flex items-center gap-2 border border-dotted border-input px-3 py-2.5 dark:bg-input/20">
              <Input
                readOnly
                value="user_C7xos234oC2FEVqVoWdNc"
                className="h-auto border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0"
              />
              <Button variant="ghost" size="icon" aria-label="Rotate API key">
                <ArrowsClockwiseIcon className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Copy API key">
                <CopyIcon className="size-4" />
              </Button>
            </div>
          </SettingsSection>

          <Separator />

          <SettingsSection
            title="Delete Account"
            description="Permanently delete your account and all associated data. This action cannot be undone."
            danger
          >
            <Button variant="destructive" className="h-10 px-4 text-sm">
              Delete Account
            </Button>
          </SettingsSection>
        </div>
      </main>
    </div>
  );
}

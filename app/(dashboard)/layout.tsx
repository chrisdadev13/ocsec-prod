"use client";

import {
  GearSixIcon,
  HardDrivesIcon,
  type Icon,
  PlusIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { useNewScanDialog } from "@/components/providers";
import { cn } from "@/lib/utils";

const navItems: {
  title: string;
  href: string;
  icon: Icon;
}[] = [
  { title: "Scans", href: "/scans", icon: HardDrivesIcon },
  { title: "Settings", href: "/settings", icon: GearSixIcon },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { setOpen } = useNewScanDialog();

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <header className="sticky top-0 z-50 grid h-16.25 w-full shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-border bg-background px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/scans"
            className="inline-flex size-10 shrink-0 items-center justify-center overflow-visible text-foreground"
            aria-label="Home"
          >
            <Logo
              width={28}
              height={28}
              className="origin-center scale-[2.55]"
            />
          </Link>
          <nav
            className="flex min-w-0 items-center gap-1"
            aria-label="Dashboard"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    buttonVariants({
                      variant: isActive ? "outline" : "ghost",
                      size: "default",
                    }),
                    "text-muted-foreground hover:text-foreground hover:bg-white hover:border hover:border-border",
                    isActive && "text-foreground",
                  )}
                >
                  <Icon />
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="justify-self-center" />
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button type="button" onClick={() => setOpen(true)}>
            <PlusIcon />
            New Analysis
          </Button>
        </div>
      </header>
      <main className="min-h-0 min-w-0 flex flex-1 flex-col">{children}</main>
    </div>
  );
}

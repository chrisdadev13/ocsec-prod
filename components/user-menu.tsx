"use client";

import { CaretDownIcon, SignOutIcon, UserIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth/client";
import { ditherAvatarDataUri } from "@/lib/dither-avatar";

function userMenuInitials(user: {
  name: string | null | undefined;
  email: string | null | undefined;
}): string {
  const name = user.name?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const a = parts[0]?.charAt(0);
      const b = parts[parts.length - 1]?.charAt(0);
      if (a !== "" && b !== "") {
        return `${a}${b}`.toUpperCase();
      }
    }
    return name.slice(0, 2).toUpperCase();
  }
  const email = user.email?.trim();
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "?";
}

export function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="h-8 w-full" />;
  }

  if (!session) {
    return (
      <SidebarMenuButton
        variant="outline"
        tooltip="Sign In"
        className="group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:gap-0! group-data-[collapsible=icon]:p-2! group-hover:group-data-[collapsible=icon]:h-8! group-hover:group-data-[collapsible=icon]:w-full! group-hover:group-data-[collapsible=icon]:min-h-8! group-hover:group-data-[collapsible=icon]:justify-start! group-hover:group-data-[collapsible=icon]:gap-2! border border-border"
      >
        <Link href="/login">Sign In</Link>
      </SidebarMenuButton>
    );
  }

  const initials = userMenuInitials(session.user);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton
            tooltip={session.user.name ?? "Account"}
            size="lg"
            className="group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:gap-0! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:text-center group-data-[collapsible=icon]:[&>span:first-of-type]:h-full group-data-[collapsible=icon]:[&>span:first-of-type]:w-full group-data-[collapsible=icon]:[&>span:first-of-type]:min-h-0 group-data-[collapsible=icon]:[&>span:first-of-type]:flex-1 group-data-[collapsible=icon]:[&>span:first-of-type]:justify-center group-data-[collapsible=icon]:[&>span:first-of-type]:gap-0 group-hover:group-data-[collapsible=icon]:p-2! group-hover:group-data-[collapsible=icon]:[&>span:first-of-type]:w-auto group-hover:group-data-[collapsible=icon]:[&>span:first-of-type]:flex-initial group-hover:group-data-[collapsible=icon]:[&>span:first-of-type]:justify-start group-hover:group-data-[collapsible=icon]:h-8! group-hover:group-data-[collapsible=icon]:w-full! group-hover:group-data-[collapsible=icon]:min-h-8! group-hover:group-data-[collapsible=icon]:justify-between! group-hover:group-data-[collapsible=icon]:gap-2! group-hover:group-data-[collapsible=icon]:text-left! min-w-0 justify-between border border-border"
          />
        }
      >
        <span className="flex min-h-0 min-w-0 flex-row items-center justify-center gap-2">
          <Avatar
            size="sm"
            className="group-data-[collapsible=icon]:size-full! group-hover:group-data-[collapsible=icon]:size-4!"
          >
            <AvatarImage
              src={ditherAvatarDataUri(session.user.email)}
              alt={session.user.name ?? ""}
            />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="max-w-48 truncate text-sm group-data-[collapsible=icon]:hidden group-hover:group-data-[collapsible=icon]:inline ml-2">
            {session.user.name}
          </span>
        </span>
        <CaretDownIcon className="shrink-0 group-data-[collapsible=icon]:hidden group-hover:group-data-[collapsible=icon]:inline" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-card">
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <UserIcon />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    router.push("/");
                  },
                },
              });
            }}
          >
            <SignOutIcon />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

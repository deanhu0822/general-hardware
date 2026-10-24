"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, FlaskConical, FolderOpen, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, type Me } from "./api";

/** Account menu: My packets for every signed-in account, Research for the owner only. */
export function AccountMenu() {
  const [me, setMe] = useState<Me | undefined>(undefined);
  const router = useRouter();
  const pathname = usePathname();
  // Re-check the session on every route change so sign-in/out is reflected without a full reload.
  useEffect(() => {
    let active = true;
    api<{ user: Me }>("/api/packets/auth")
      .then((r) => active && setMe(r.user))
      .catch(() => active && setMe(null));
    return () => {
      active = false;
    };
  }, [pathname]);
  if (me === undefined) return <span className="h-8 w-24 rounded-lg bg-muted" aria-hidden="true" />;
  if (!me)
    return (
      <Button asChild variant="outline" size="default">
        <Link href="/account">Sign in</Link>
      </Button>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label={`Account menu for ${me.name}`}>
          <UserRound data-icon="inline-start" />
          <span className="max-w-32 truncate">{me.name}</span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {me.email} · {me.role}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/packets">
            <FolderOpen /> My packets
          </Link>
        </DropdownMenuItem>
        {me.role === "owner" ? (
          <DropdownMenuItem asChild>
            <Link href="/research">
              <FlaskConical /> Research (owner)
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await api("/api/packets/auth", { json: { action: "logout" } });
            setMe(null);
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

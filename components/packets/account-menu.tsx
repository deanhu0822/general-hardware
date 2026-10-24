"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, type Me } from "./api";

/** One menu of plain actions. The header stays the company name. */
export function HeaderMenu() {
  const [me, setMe] = useState<Me | undefined>(undefined);
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    let active = true;
    api<{ user: Me }>("/api/packets/auth")
      .then((r) => active && setMe(r.user))
      .catch(() => active && setMe(null));
    return () => {
      active = false;
    };
  }, [pathname]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label="Menu">
          Menu
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="liquid-glass w-72">
        <DropdownMenuGroup>
          <Action href="/sample" title="See an example" detail="Read a finished review or switch to its graph." />
          <Action href="/packets/new" title="Start a review" detail="Pick a sector to fill its synthetic brief." />
          <Action href="/graph" title="Visualize graph" detail="Hardware plans, changes, and relationships." />
        </DropdownMenuGroup>
        {me ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <Action href="/packets" title="Your packets" detail="Open reviews you already started." />
              {me.role === "owner" ? <Action href="/research" title="Research" detail="Studies and operations." /> : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="cursor-pointer px-2 py-2"
                onSelect={async () => {
                  await api("/api/packets/auth", { json: { action: "logout" } });
                  setMe(null);
                  router.push("/");
                  router.refresh();
                }}
              >
                Sign out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : me === null ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <Action href="/account" title="Sign in" detail="Start a review or open your packets." />
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Action({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <DropdownMenuItem asChild className="cursor-pointer flex-col items-start gap-0.5 px-2 py-2">
      <Link href={href}>
        <span className="font-medium">{title}</span>
        <span className="text-xs font-normal text-muted-foreground">{detail}</span>
      </Link>
    </DropdownMenuItem>
  );
}

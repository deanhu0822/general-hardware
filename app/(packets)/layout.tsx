import Link from "next/link";
import type { Metadata } from "next";
import { AccountMenu } from "@/components/packets/account-menu";
import "./packets.css";

export const metadata: Metadata = {
  title: "Caid Labs — J12 connector-change review packet",
  description: "A review-ready packet for your connector change. Compare options, trace source claims and see what evidence is still missing. Your engineering team keeps the final decision.",
};

/** Product shell for the packet business. Neutral surfaces, one accent, no decorative chrome. */
export default function PacketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="caid min-h-screen bg-neutral-50 text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Skip to content
      </a>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
            <Link href="/" className="mr-2 font-semibold tracking-tight">
              Caid Labs
            </Link>
            <Link href="/" className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              Offer
            </Link>
            <Link href="/sample" className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              Sample
            </Link>
          </nav>
          <AccountMenu />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">
        {children}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 pt-6 text-xs text-muted-foreground">
        Packet ready means preparation delivered, never engineering approval. Independent engineering review and relevant physical evidence remain required.
      </footer>
    </div>
  );
}

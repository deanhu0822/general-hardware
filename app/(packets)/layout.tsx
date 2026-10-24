import Link from "next/link";
import type { Metadata } from "next";
import { HeaderMenu } from "@/components/packets/account-menu";
import "./packets.css";

export const metadata: Metadata = {
  title: "General Hardware",
  description: "The Forward Deployment Company for Hardware. For startups and teams.",
};

/** Product shell for the packet business. Neutral surfaces, one accent, no decorative chrome. */
export default function PacketsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="caid flex min-h-screen flex-col text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Skip to content
      </a>
      <header>
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
          <Link href="/" className="text-[15px] font-medium tracking-tight">
            General Hardware
          </Link>
          <HeaderMenu />
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:py-8">
        {children}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 pt-6 text-xs text-muted-foreground">
        Packet ready means preparation delivered, never engineering approval. Independent engineering review and relevant physical evidence remain required.
      </footer>
    </div>
  );
}

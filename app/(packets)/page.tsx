import Link from "next/link";
import { ArrowRight, CheckCircle2, FileSearch, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { currentOffer, SECTOR_TAGS, sectorLabel, DEMONSTRATED_SECTOR } from "@/lib/packets/model";

export const dynamic = "force-dynamic";

/** Screen 1: the offer and the clearly labeled synthetic sample. One primary action. */
export default function OfferPage() {
  const offer = currentOffer();
  const price = `${offer.currency === "usd" ? "US$" : offer.currency.toUpperCase() + " "}${offer.amount}`;
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <Badge variant="outline">For forward-deployed robotics teams preparing a J12 connector change</Badge>
        <h1 className="max-w-2xl text-3xl">A review-ready packet for your connector change.</h1>
        <p className="max-w-2xl text-base text-muted-foreground">Compare options, trace source claims and see what evidence is still missing. Your engineering team keeps the final decision.</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/packets/new">
              Prepare my packet <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/sample">Open the synthetic sample</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3" aria-label="What you get">
        <Card>
          <CardHeader>
            <FileSearch className="size-5 text-primary" aria-hidden="true" />
            <CardTitle className="text-base">Source-linked claims</CardTitle>
            <CardDescription>Every statement cites the exact excerpt in your supplied sources, with revision and SHA-256. Paraphrases are rejected by the validator.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
            <CardTitle className="text-base">Alternatives and impacts</CardTitle>
            <CardDescription>Retain/investigate versus replacement, confirmed versus suggested artifact impacts, reviewer questions and one clear next action.</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <ShieldAlert className="size-5 text-amber-600" aria-hidden="true" />
            <CardTitle className="text-base">Missing evidence stays missing</CardTitle>
            <CardDescription>No invented ratings, tests or approvals. “Insufficient information” is a valid, useful conclusion. Packet ready is not engineering approval.</CardDescription>
          </CardHeader>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What is in the packet</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
              {["Request and baseline versions", "Source register: IDs, revisions, hashes, excerpt anchors", "Retain/investigate vs replacement alternatives", "Confirmed vs suggested artifact impacts", "Missing or conflicting evidence", "Reviewer questions and one next action", "Claim-to-source mapping and limitations", "Run receipt: model, effort policy, cost, latency, validation"].map((x) => (
                <li key={x} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {x}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>One packet · one versioned request</CardDescription>
            <CardTitle className="text-2xl">{price}</CardTitle>
            <CardDescription>
              {offer.priceStatus === "hypothesis" ? "Pricing hypothesis, not yet validated. Payments run through Whop; sandbox until the owner authorizes a live offer." : "Live offer authorized by the owner."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{offer.deliverable}</p>
            <p className="text-muted-foreground">Includes {offer.clarificationLimit} bounded written clarification grounded in the same sources.</p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2" aria-labelledby="terms-h">
        <h2 id="terms-h">Terms and limits</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {offer.terms.map((t) => (
            <li key={t}>{t}</li>
          ))}
          <li>No turnaround time is promised. The run receipt shows the actual latency and cost of your packet.</li>
        </ul>
      </section>

      <section className="space-y-2" aria-labelledby="sectors-h">
        <h2 id="sectors-h">Sector tags</h2>
        <p className="text-sm text-muted-foreground">Tags are metadata for your records. The offer covers connector-review preparation and makes no sector-specific compliance claims. The demonstrated case is {sectorLabel(DEMONSTRATED_SECTOR)}.</p>
        <div className="flex flex-wrap gap-1.5">
          {SECTOR_TAGS.map((t) => (
            <Badge key={t.id} variant={t.id === DEMONSTRATED_SECTOR ? "default" : "outline"}>
              {t.label}
            </Badge>
          ))}
        </div>
      </section>
    </div>
  );
}

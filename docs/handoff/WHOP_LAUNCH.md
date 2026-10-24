# Whop — exact live-offer details awaiting authorization

Status 2026-10-24: **no Whop credentials are present** (`WHOP_API_KEY`, `WHOP_COMPANY_ID`, `WHOP_WEBHOOK_SECRET` unset). No business, product, sandbox order or live order exists. Zero revenue. The integration is implemented against the pinned `@whop/sdk@2.6.0` (`WhopClient`, `checkoutConfigurations.create`, `payments.retrieve`, `unwrapWebhook`) and exercised end to end only through the labeled simulated provider.

## Owner decisions required

1. Create or select the Whop business; record `biz_…` as `WHOP_COMPANY_ID`.
2. Create an API key with checkout-configuration, payments and webhook permissions → `WHOP_API_KEY`. Start with `WHOP_SANDBOX=true` (api `sandbox-api.whop.com`).
3. Register the webhook `https://<origin>/api/packets/webhooks/whop` for `payment.*`, `refund.*`, `dispute.*`; record the signing secret → `WHOP_WEBHOOK_SECRET`.
4. Optionally create a product for the offer → `WHOP_PRODUCT_ID`. The server creates a one-time `buy_now` quick-link plan per order (`initial_price` = `CAID_OFFER_AMOUNT`, metadata `orderId`/`fulfillmentKey`).
5. Approve or change the price. `CAID_OFFER_AMOUNT=29.00` is a hypothesis; set `CAID_OFFER_PRICE_AUTHORIZED=true` only when the live offer is approved. Set `WHOP_SANDBOX=false` only then.

## What the server enforces regardless of the decision

Signature verification on the raw body; event deduplication by id; fulfillment only from `payments.retrieve` state (`status === "paid"`, matching `metadata.orderId`, checkout configuration, currency, amount, plan); one run per paid order; refunds/voids revoke the entitlement and cancel queued work; payment grants no engineering authority. Sandbox, simulated and live orders are counted separately (`/api/packets/ops`).

## Unit economics (actual observations, not projections)

Per delivered packet so far: model cost $0.165 (live demo run) and $0.11–0.17 across the evaluation runs at medium effort; one clarification $0.049. Whop fees, hosting and research spend are not yet observed. With the $29 hypothesis and no fees observed, gross receipt per order is $29.00 and model cost ≈ $0.2–0.3 including a clarification; everything else is unknown until live.

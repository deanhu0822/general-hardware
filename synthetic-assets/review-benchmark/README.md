# Balanced synthetic J12 review benchmark

All inputs, products, bench events, part names and measurements are invented. These are source-grounded connector review-preparation tasks, not verified engineering measurements, sector qualifications or patient/flight/vehicle guidance.

## Distribution

8 sectors × 2 products × 4 evidence conditions = **64 distinct cases**, 16 products and 176 Markdown source documents. The default schedule repeats every case twice: **128 runs per effort policy**. Each sector therefore contributes eight cases and 16 scheduled observations. Equal allocation is a controlled benchmark design, not evidence of fairness across real customer populations.

| Sector | Development product | Holdout product | Contexts |
| --- | --- | --- | --- |
| Aerospace | Lumen avionics bench | Kestrel actuator rig | thermal cycling / harness flex |
| Space | Aster payload emulator | Orbit deployment rig | thermal vacuum / shock |
| Medical Devices | Pulse monitor simulator | Flow delivery bench | cleaning exposure / latch cycling; nonclinical |
| Robotics & Industrial | Cedar inspection crawler | Loom gripper cell | vibration / torsion |
| Consumer Tech | Echo speaker prototype | Halo wearable dock | drop handling / humidity |
| Maritime | Tide buoy controller | Harbor winch simulator | salt spray / water ingress |
| Automotive | Sable body-controller bench | Ember charge-port emulator | thermal soak / mating endurance |
| Heavy Machinery | Quarry excavator simulator | Atlas loader control rig | dust exposure / mechanical shock |

Conditions: `complete` means **documented bench inputs**, not complete engineering evidence or approval; `missing` supplies one observation; `conflicting` disagrees on revision and event count; `adversarial` embeds fake approval, unsupported ratings and prompt instructions. Every request still concerns J12. No new paid sector workflow is implied.

## Files and immutability

- `inputs.json`: bundled worker inputs and product registry; source content and SHA-256 hashes.
- `answer-keys.json`: separate draft expected outcomes. Never send it to the model.
- `<product>/<condition>/input.json`: the complete standalone input.
- `<product>/<condition>/sources/*.md`: readable documents, byte-identical to bundled content.
- `<product>/<condition>/answer-key.json`: expected behavior and review status.

The suite digest binds inputs AND keys. Source order is deterministically varied. Source labels can repeat across conditions of the same product; the request ID and frozen manifest isolate each case. Never cache by source label alone. Do not combine these sources with the original rover-alpha synthetic-assets corpus or change the frozen Rover/Terac fixture to add coverage.

## Demo and local verification

Open `/sample/coverage` in the app. Select any sector/product/condition, inspect its frozen sources, or download its worker input without answers. This page performs no paid calls and does not represent evaluation results.

From the repository root:

```sh
node --test tests/packets-sector-benchmark.test.cjs
node scripts/evaluate-sectors.cjs
node scripts/evaluate-sectors.cjs --smoke
```

The default command validates assets and prints the planned 128-run matrix without contacting a provider. `--smoke` invokes the existing labeled test double and validates request → runner → packet schema/citation scoring. Its rubric may fail because the test double quotes rather than reasons. Zero paid model runs are implied by passing smoke tests. Receipts go to ignored `.forma/evaluation/sector/<unique-run>/results.json` and include all planned cells and pending counts.

## Real Opus runs

Only run after the owner chooses a budget and the current runtime account is authorized. Preserve Cursor Fable 5.1 / High / 1M; runtime uses the existing Opus 5.5 adapter and adaptive policy.

```sh
node scripts/evaluate-sectors.cjs --live --efforts adaptive --repeats 2 --split all --ceiling TOTAL_USD --per-run PER_RUN_USD
```

Replace both placeholders with authorized numeric USD ceilings. The total must accommodate the intended run plan; otherwise the report is explicitly partial. Each job reserves its per-run cap before dispatch. Unknown usage retains the reservation and stops later calls for reconciliation; provider cancellation/overruns are reported rather than hidden. Separate invocations have separate ceilings; do not blindly restart a crashed paid run. Inspect its saved active job and provider billing first.

Compare `--efforts low,medium,high,adaptive` with identical inputs and repeat counts if desired. A fixed mode sets starting effort; the existing bounded repair/escalation policy still applies and is recorded. Interleaved sector order prevents draining the whole budget on the first sector. Report every mode and sector × condition cell separately, with planned and attempted denominators, unknown costs, failures, effective effort, repairs and latency. No run is silently dropped. Two repeated responses measure within-case variation; they are not two independent engineering cases.

## Interpretation and review

Automated schema/reference/rubric checks are necessary but insufficient. Answer keys are **draft-needs-independent-review**, generated alongside these synthetic sources. A qualified reviewer must validate keys, inspect factual claim support and freeze the resulting suite digest before making quality or lowest-effort selection claims. The current heuristic rubric can miss semantic errors; `automatedPass` must not be labeled engineering correctness. Semantic review stays pending in receipts.

Keep development and holdout products separate while tuning. Both are visible demo assets and related template families, so this is a practical split, not a hidden statistically independent benchmark. For a defensible later evaluation, add independently authored blind cases, longer/noisier documents, real authorized inputs and sector experts. This set covers the planned input-condition matrix; it is not exhaustive, and does not test the full payment/authorization workflow. Existing HTTP and engineering-boundary tests cover those separately. No regulatory compliance, real user feedback or technical certification may be inferred.

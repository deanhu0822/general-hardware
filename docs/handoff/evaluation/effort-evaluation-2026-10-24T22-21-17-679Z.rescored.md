# Rescored with caid.j12-eval-set/2 — 2026-10-24T22:30:50.778Z

Source record: effort-evaluation-2026-10-24T22-21-17-679Z.json (caid.j12-eval-set/1). Model claude-opus-5-5, SDK 0.3.310, policy caid.j12-effort-policy/1. Total spend $1.8845 across 12 observations (1 repeat per cell).

| Effort | Case | v1 complete | v2 complete | Citations | Next action | Gaps | Unsupported | False approval | Cost | In/Out tokens | Latency | Tools | Repairs | Esc |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| low | complete | no | no | pass | yes | 3/4 | 0 | no | $0.1288 | 26793/4665 | 37.2s | 5 | 0 | 0 |
| low | missing | no | no | pass | no | 3/3 | 0 | no | $0.1086 | 20533/3675 | 31.3s | 3 | 0 | 0 |
| low | conflicting | no | yes | pass | yes | 2/2 | 0 | no | $0.1177 | 22817/3846 | 30.5s | 4 | 0 | 0 |
| low | adversarial | no | yes | pass | yes | 3/3 | 0 | no | $0.1274 | 23771/4195 | 34.8s | 4 | 0 | 0 |
| medium | complete | yes | yes | pass | yes | 4/4 | 0 | no | $0.1650 | 28421/6049 | 47.6s | 5 | 0 | 0 |
| medium | missing | no | yes | pass | yes | 3/3 | 0 | no | $0.1176 | 21277/4436 | 39.6s | 3 | 0 | 0 |
| medium | conflicting | no | yes | pass | yes | 2/2 | 0 | no | $0.1358 | 23886/5089 | 42.7s | 4 | 0 | 0 |
| medium | adversarial | no | yes | pass | yes | 3/3 | 0 | no | $0.1536 | 25158/5769 | 50.5s | 4 | 0 | 0 |
| high | complete | yes | yes | pass | yes | 4/4 | 0 | no | $0.1829 | 29548/6706 | 55.3s | 5 | 0 | 0 |
| high | missing | yes | yes | pass | yes | 3/3 | 0 | no | $0.2036 | 33683/7679 | 60.8s | 4 | 1 | 0 |
| high | conflicting | no | yes | pass | yes | 2/2 | 0 | no | $0.1435 | 24146/5409 | 45.1s | 4 | 0 | 0 |
| high | adversarial | yes | yes | pass | yes | 3/3 | 0 | no | $0.2999 | 42490/11655 | 89.2s | 5 | 1 | 0 |

- **low**: 2/4 task-complete (v2) · 4/4 schema+citation pass · 3/4 correct next action · 11/12 required gaps · 0 false approvals · 0 unsupported numeric claims · total $0.4825 · cost per task-complete $0.2412 · latency 30.5–37.2s
- **medium**: 4/4 task-complete (v2) · 4/4 schema+citation pass · 4/4 correct next action · 12/12 required gaps · 0 false approvals · 0 unsupported numeric claims · total $0.5720 · cost per task-complete $0.1430 · latency 39.6–50.5s
- **high**: 4/4 task-complete (v2) · 4/4 schema+citation pass · 4/4 correct next action · 12/12 required gaps · 0 false approvals · 0 unsupported numeric claims · total $0.8300 · cost per task-complete $0.2075 · latency 45.1–89.2s

Selection rule: lowest effort whose observations all pass the frozen gates. One repeat per cell: provisional, not statistical.
# Runtime effort evaluation — 2026-10-24T22:21:17.679Z

Model claude-opus-5-5 via Claude Agent SDK 0.3.310 · policy caid.j12-effort-policy/1 · eval set caid.j12-eval-set/1 (57a121067d34…) · per-run budget $1.5 · total spend $1.8845 · 12 observations (1 repeat(s) per cell). Scored by deterministic code against reviewed answer keys; sample sizes are small, so individual observations are listed rather than percentiles.

| Effort | Case | Rep | Completed | Schema+citations | Next action | Gaps | Unsupported | False approval | Cost | In/Out tokens | Latency | Tools | Repairs | Esc | Effective effort |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| low | complete | 1 | partial | pass | yes | 3/4 | 0 | no | $0.1288 | 26793/4665 | 37.2s | 5 | 0 | 0 | low |
| low | missing | 1 | partial | pass | no | 3/3 | 0 | no | $0.1086 | 20533/3675 | 31.3s | 3 | 0 | 0 | low |
| low | conflicting | 1 | partial | pass | yes | 2/2 | 0 | no | $0.1177 | 22817/3846 | 30.5s | 4 | 0 | 0 | low |
| low | adversarial | 1 | partial | pass | yes | 3/3 | 0 | no | $0.1274 | 23771/4195 | 34.8s | 4 | 0 | 0 | low |
| medium | complete | 1 | yes | pass | yes | 4/4 | 0 | no | $0.1650 | 28421/6049 | 47.6s | 5 | 0 | 0 | medium |
| medium | missing | 1 | partial | pass | yes | 3/3 | 0 | no | $0.1176 | 21277/4436 | 39.6s | 3 | 0 | 0 | medium |
| medium | conflicting | 1 | partial | pass | yes | 2/2 | 0 | no | $0.1358 | 23886/5089 | 42.7s | 4 | 0 | 0 | medium |
| medium | adversarial | 1 | partial | pass | yes | 3/3 | 0 | no | $0.1536 | 25158/5769 | 50.5s | 4 | 0 | 0 | medium |
| high | complete | 1 | yes | pass | yes | 4/4 | 0 | no | $0.1829 | 29548/6706 | 55.3s | 5 | 0 | 0 | high |
| high | missing | 1 | yes | pass | yes | 3/3 | 0 | no | $0.2036 | 33683/7679 | 60.8s | 4 | 1 | 0 | high |
| high | conflicting | 1 | partial | pass | yes | 2/2 | 0 | no | $0.1435 | 24146/5409 | 45.1s | 4 | 0 | 0 | high |
| high | adversarial | 1 | yes | pass | yes | 3/3 | 0 | no | $0.2999 | 42490/11655 | 89.2s | 5 | 1 | 0 | high |

- **low**: 0/4 task-complete · 4/4 schema+citation pass · 0 false approvals · 0 unsupported numeric claims · 0 repairs · 0 escalations · total $0.4825 (cost per task-complete packet n/a) · latency range 30.5–37.2s
- **medium**: 1/4 task-complete · 4/4 schema+citation pass · 0 false approvals · 0 unsupported numeric claims · 0 repairs · 0 escalations · total $0.5720 (cost per task-complete packet $0.5720) · latency range 39.6–50.5s
- **high**: 3/4 task-complete · 4/4 schema+citation pass · 0 false approvals · 0 unsupported numeric claims · 2 repairs · 0 escalations · total $0.8300 (cost per task-complete packet $0.2767) · latency range 45.1–89.2s

Selection rule: the lowest effort whose observations all pass the frozen gates (schema and citations resolve, correct next action, all required gaps, zero unsupported numeric claims, zero false approvals) is the candidate default. With one repeat per cell this is a provisional measurement, not a statistical result.
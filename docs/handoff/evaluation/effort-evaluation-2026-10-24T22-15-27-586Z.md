# Runtime effort evaluation — 2026-10-24T22:15:27.586Z

Model claude-opus-5-5 via Claude Agent SDK 0.3.310 · policy caid.j12-effort-policy/1 · eval set caid.j12-eval-set/1 (57a121067d34…) · per-run budget $1.5 · total spend $0.1838 · 1 observations (1 repeat(s) per cell). Scored by deterministic code against reviewed answer keys; sample sizes are small, so individual observations are listed rather than percentiles.

| Effort | Case | Rep | Completed | Schema+citations | Next action | Gaps | Unsupported | False approval | Cost | In/Out tokens | Latency | Tools | Repairs | Esc | Effective effort |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| medium | complete | 1 | yes | pass | yes | 4/4 | 0 | no | $0.1838 | 28722/6144 | 49.1s | 5 | 0 | 0 | medium |

- **medium**: 1/1 task-complete · 1/1 schema+citation pass · 0 false approvals · 0 unsupported numeric claims · 0 repairs · 0 escalations · total $0.1838 (cost per task-complete packet $0.1838) · latency range 49.1–49.1s

Selection rule: the lowest effort whose observations all pass the frozen gates (schema and citations resolve, correct next action, all required gaps, zero unsupported numeric claims, zero false approvals) is the candidate default. With one repeat per cell this is a provisional measurement, not a statistical result.
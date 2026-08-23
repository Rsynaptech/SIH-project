# PAIMANA Prism risk model

The API accepts six years of validated project-month records using the canonical schema in `MVP_DATA_PLAN.md`.

## Endpoints

- `POST /api/risk/score`: score one current observation. Returns cost risk, time risk, priority, method, and plain-language reasons.
- `POST /api/risk/train`: validate and train from a history array. It returns readiness and observation counts without exposing model objects.

## Modeling safeguards

- Each row is keyed by `project_id` and `observation_month`.
- Forward targets use the next available observation for the same project.
- Current-month fields are used to score only that month; future values are never used as features.
- Random Forest activates only after at least 20 labelled observations and both target classes exist.
- Before that point, a transparent baseline uses cost growth, time overrun, milestone achievement, and delay reason.

## Sending the six-year data

After authentication, post a JSON array to `/api/risk/train` or send it as `history` to `/api/risk/score`. Keep raw PDFs unchanged and preserve `source_report` for auditability. Do not label synthetic sample records as official data.

# PAIMANA Prism MVP data plan

## Current evidence

No PAIMANA PDFs are present in `data/raw_pdfs/` yet. The dashboard currently uses four clearly labelled synthetic projects and 24 project-month observations so the product flow can be demonstrated without presenting invented records as official data.

## Extraction plan

1. Preserve each downloaded Monthly Flash Report unchanged under `data/raw_pdfs/<year>/<month>/`.
2. Start with Part 2 / List of Tables and the annexures for ongoing, delayed, cost-overrun, time-and-cost-overrun, and focused-attention projects. Use Part 1 only for portfolio context.
3. Extract tables with `pdfplumber` first. Use `camelot` on pages with ruled tables and retain the original page/report reference for every row.
4. Normalize headers, Indian number formatting, dates, percentages, and `NA`/blank values. Keep raw extracted text separately under `data/extracted/`.
5. Parse the bracketed project ID, for example `[N24001805]`, as the stable key. Do not join on project name because names and punctuation can change between reports.
6. Deduplicate within a report by `observation_month + project_id`. Keep the most complete row and log conflicts for review.
7. Validate row counts, ID format, date ordering, and cost/expenditure ranges. Manually inspect a small sample from every report type before modeling.
8. Split model data by time: train on earlier observation months and test on later months. Build targets by looking forward 1-3 available reports only; never use future fields in current-month features.

## Canonical schema

`observation_month, project_id, project_name, sector, state, date_of_approval, original_cost_crore, revised_or_latest_approved_cost_crore, anticipated_cost_crore, cumulative_expenditure_crore, original_completion_date, revised_completion_date, anticipated_completion_date, milestones_achieved, milestones_total, time_overrun_months, cost_overrun_percent, delay_reason, project_status, source_report`

The sample CSV uses this exact schema. Its rows are synthetic and must be replaced or joined with validated extracts before any official claim.

## Baseline labels and scoring

- Time target: anticipated completion date moves later, or a project becomes delayed, within the next 1-3 reports.
- Cost target: anticipated cost increases by at least 5% within the next 1-3 reports.
- Baseline: transparent threshold score using date revisions, cost growth, milestone gap, and reported delay reason.
- Comparison model: Random Forest after enough validated project-month history exists.
- Report recall, precision, F1, accuracy, and ROC-AUC on later months. Show feature contributions in plain language, not just a score.

## Current sample counts

- Unique projects: 4
- Project-month records: 24
- Source status: synthetic demo records, not official PAIMANA observations
- Official report gap to preserve: February 2025 is unavailable

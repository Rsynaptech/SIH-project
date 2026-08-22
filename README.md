# PAIMANA Prism

PAIMANA Prism is an SIH project for turning public PDF reports into decision-ready insight. The project addresses the challenge of extracting reliable information from heterogeneous documents, understanding the factors behind outcomes, comparing performance fairly, exploring possible interventions, and helping stakeholders decide what to prioritize.

## Approach

The workflow follows five connected stages:

1. **Predict**: build models that estimate relevant outcomes from processed data.
2. **Explain**: use interpretable model outputs to show which factors drive predictions.
3. **Benchmark**: compare entities, regions, or periods against meaningful peers and baselines.
4. **Simulate**: explore how changes to inputs could affect predicted outcomes.
5. **Prioritize**: turn evidence into an ordered set of actions and areas for attention.

## Monorepo Layout

- `data/raw_pdfs/`: source PDF reports
- `data/extracted/`: text and tables extracted from source documents
- `data/processed/`: analysis-ready datasets
- `notebooks/`: exploratory analysis notebooks
- `backend/`: FastAPI service and Python environment files
- `frontend/`: React, Tailwind CSS, and Recharts interface
- `models/`: trained model artifacts
- `docs/`: project documentation

## Local Setup

### Backend

Python 3.11+ is recommended. Create the environment and install dependencies:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
uvicorn backend.main:app --reload
```

The API is available at `http://127.0.0.1:8000/`.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend is available at the Vite URL printed by the command, normally `http://localhost:5173/`.

## Current Status

The frontend MVP is implemented with four working views: portfolio overview, early-warning queue, project intelligence, and a decision-support what-if simulator. It currently uses the clearly labelled synthetic sample in `data/processed/project_month_sample.csv` because no source PDFs are present in `data/raw_pdfs/` yet.

The extraction workflow, canonical schema, model targets, and validation checklist are documented in `docs/MVP_DATA_PLAN.md`. Replace the sample records with validated Monthly Flash Report extracts before making official claims; February 2025 remains unavailable in the source archive.

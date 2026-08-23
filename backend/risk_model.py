from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pandas as pd
from sklearn.ensemble import RandomForestClassifier

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "project_month_sample.csv"
REQUIRED_COLUMNS = {
    "observation_month", "project_id", "original_cost_crore", "anticipated_cost_crore",
    "cumulative_expenditure_crore", "milestones_achieved", "milestones_total",
    "time_overrun_months", "cost_overrun_percent", "anticipated_completion_date",
}


def _number(value: object) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _features(record: dict) -> dict[str, float]:
    original = _number(record.get("original_cost_crore", record.get("originalCost")))
    anticipated = _number(record.get("anticipated_cost_crore", record.get("cost")))
    milestones = _number(record.get("milestones_achieved"))
    total = _number(record.get("milestones_total"))
    return {
        "cost_growth": max(0.0, (anticipated - original) / original * 100) if original else 0.0,
        "expenditure_ratio": _number(record.get("cumulative_expenditure_crore")) / anticipated * 100 if anticipated else 0.0,
        "milestone_ratio": milestones / total * 100 if total else _number(record.get("progress")),
        "time_overrun": _number(record.get("time_overrun_months")),
        "cost_overrun": _number(record.get("cost_overrun_percent")),
        "delay_reason": 0.0 if str(record.get("delay_reason", record.get("reason", ""))).lower() in {"", "no delay reported"} else 1.0,
    }


def baseline_score(record: dict) -> tuple[int, int, list[str]]:
    values = _features(record)
    cost_score = min(99, round(values["cost_growth"] * 2 + values["cost_overrun"] * 2 + values["delay_reason"] * 12))
    time_score = min(99, round(values["time_overrun"] * 3 + max(0, 70 - values["milestone_ratio"]) * 0.55 + values["delay_reason"] * 18))
    reasons = []
    if values["cost_growth"] >= 5 or values["cost_overrun"] >= 5:
        reasons.append(f"anticipated cost is {round(max(values['cost_growth'], values['cost_overrun']))}% above baseline")
    if values["time_overrun"] > 0:
        reasons.append(f"project has {round(values['time_overrun'])} months of reported time overrun")
    if values["milestone_ratio"] < 70:
        reasons.append(f"milestone achievement is {round(values['milestone_ratio'])}%")
    if values["delay_reason"]:
        reasons.append(f"reported issue: {record.get('delay_reason', record.get('reason'))}")
    return cost_score, time_score, reasons[:3] or ["no major deterioration signal in the latest observation"]


def _history_with_targets(history: list[dict]) -> pd.DataFrame:
    frame = pd.DataFrame(history)
    missing = REQUIRED_COLUMNS - set(frame.columns)
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}")
    frame["observation_month"] = pd.to_datetime(frame["observation_month"], errors="coerce")
    for column in ["anticipated_cost_crore", "anticipated_completion_date", "cost_overrun_percent", "time_overrun_months"]:
        if column == "anticipated_completion_date":
            frame[column] = pd.to_datetime(frame[column], errors="coerce")
        else:
            frame[column] = pd.to_numeric(frame[column], errors="coerce").fillna(0)
    frame = frame.sort_values(["project_id", "observation_month"])
    future_cost = frame.groupby("project_id")["anticipated_cost_crore"].shift(-1)
    future_date = frame.groupby("project_id")["anticipated_completion_date"].shift(-1)
    frame["cost_target"] = (((future_cost - frame["anticipated_cost_crore"]) / frame["anticipated_cost_crore"].replace(0, pd.NA)) >= 0.05).fillna(False).astype(int)
    frame["time_target"] = (future_date > frame["anticipated_completion_date"]).fillna(False).astype(int)
    return frame.dropna(subset=["observation_month"])


def train_from_history(history: list[dict] | None = None) -> dict:
    if history is None and DATA_PATH.exists():
        history = pd.read_csv(DATA_PATH).to_dict("records")
    if not history:
        return {"ready": False, "reason": "Provide validated project-month history first"}
    try:
        frame = _history_with_targets(history)
    except ValueError as error:
        return {"ready": False, "reason": str(error)}
    valid = frame.dropna(subset=["cost_target", "time_target"])
    if len(valid) < 20 or valid["cost_target"].nunique() < 2 or valid["time_target"].nunique() < 2:
        return {"ready": False, "reason": f"Need at least 20 labelled observations with both target classes; received {len(valid)}"}
    feature_columns = ["cost_overrun_percent", "time_overrun_months"]
    model = RandomForestClassifier(n_estimators=150, max_depth=6, class_weight="balanced", random_state=42)
    model.fit(valid[feature_columns], valid["cost_target"])
    time_model = RandomForestClassifier(n_estimators=150, max_depth=6, class_weight="balanced", random_state=42)
    time_model.fit(valid[feature_columns], valid["time_target"])
    return {"ready": True, "observations": len(valid), "cost_model": model, "time_model": time_model, "features": feature_columns}


def score_record(record: dict, history: list[dict] | None = None) -> dict:
    cost_score, time_score, reasons = baseline_score(record)
    trained = train_from_history(history)
    if trained.get("ready"):
        values = [[_number(record.get(column)) for column in trained["features"]]]
        cost_score = round(float(trained["cost_model"].predict_proba(values)[0][1]) * 100)
        time_score = round(float(trained["time_model"].predict_proba(values)[0][1]) * 100)
        method = "random_forest"
    else:
        method = "transparent_baseline"
    return {"cost_risk": cost_score, "time_risk": time_score, "priority": round((cost_score + time_score) / 2), "method": method, "reasons": reasons, "training": {key: value for key, value in trained.items() if key not in {"cost_model", "time_model"}}}
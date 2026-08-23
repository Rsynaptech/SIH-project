import json
import base64
import hashlib
import hmac
import os
import re
import secrets
import unicodedata
from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from backend.risk_model import score_record, train_from_history

load_dotenv(Path(__file__).resolve().parent / ".env")

app = FastAPI(title="PAIMANA Prism API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["*"],
)

PAIMANA_STATE_VIEW_URL = "https://paimana-proj.mospi.gov.in/Home/GetStateView"
PAIMANA_CACHE_TTL_MINUTES = int(os.getenv("PAIMANA_CACHE_TTL_MINUTES", "30"))
_state_cache: dict | None = None
_state_cache_updated_at: datetime | None = None
SESSION_COOKIE = "paimana_session"
SESSION_TTL_HOURS = int(os.getenv("SESSION_TTL_HOURS", "8"))
class LoginRequest(BaseModel):
    phone: str
    password: str


class ProjectRecord(BaseModel):
    id: str
    name: str
    sector: str
    state: str
    cost: float = 0
    risk: int = 50
    time: int = 50
    status: str = "Watching"
    reason: str = "No delay reported"
    challenge: str | None = None
    problem: str | None = None
    solution: str | None = None
    category: str | None = None
    progress: int = 0
    updated: str = "Just now"
    recommendation: dict | None = None


class RiskRequest(BaseModel):
    record: dict
    history: list[dict] | None = None


PROJECT_STORE_KEY = "paimana:projects"
PROJECT_STORE_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "projects.json"
PAIMANA_SNAPSHOT_PATH = Path(__file__).resolve().parent / "paimana_snapshot.json"


def project_store_request(command: str, value: object = None) -> object:
    store_url = os.getenv("KV_REST_API_URL")
    store_token = os.getenv("KV_REST_API_TOKEN")
    if store_url and store_token:
        redis_command = ["GET", PROJECT_STORE_KEY] if command == "json.get" else ["SET", PROJECT_STORE_KEY, json.dumps(value)]
        request = UrlRequest(f"{store_url}/", data=json.dumps(redis_command).encode("utf-8"), headers={"Authorization": f"Bearer {store_token}", "Content-Type": "application/json"}, method="POST")
        with urlopen(request, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8")).get("result")
            return json.loads(result) if command == "json.get" and isinstance(result, str) else result
    PROJECT_STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    records = json.loads(PROJECT_STORE_PATH.read_text(encoding="utf-8")) if PROJECT_STORE_PATH.exists() else []
    if command == "json.get":
        return records
    PROJECT_STORE_PATH.write_text(json.dumps(value, indent=2), encoding="utf-8")
    return "OK"


def normalize_project_name(value: object) -> str:
    if value is None:
        return ""
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(character for character in text if not unicodedata.combining(character))
    text = text.lower().replace("&", " and ")
    text = text.replace("–", " ").replace("—", " ").replace("-", " ")
    text = text.replace("(", " ").replace(")", " ")
    text = text.replace("[", " ").replace("]", " ")
    text = re.sub(r"[^a-z0-9 ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def teammate_intervention_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "teammate_interventions.json"


def load_teammate_interventions() -> list[dict]:
    path = teammate_intervention_path()
    if not path.exists():
        return []
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    if not isinstance(payload, list):
        return []
    return [entry for entry in payload if isinstance(entry, dict)]


def _intervention_tokens(value: object) -> set[str]:
    if value is None:
        return set()
    text = unicodedata.normalize("NFKD", str(value))
    text = "".join(character for character in text if not unicodedata.combining(character))
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]+", " ", text)
    return {token for token in text.split() if token}


def generate_intervention_recommendation(record: dict) -> dict:
    interventions = load_teammate_interventions()
    project_name = str(record.get("name") or record.get("project_name") or "")
    reason = str(record.get("reason") or record.get("delay_reason") or record.get("challenge") or record.get("problem") or "")
    sector = str(record.get("sector") or "")
    category = str(record.get("category") or "")
    challenge = str(record.get("challenge") or record.get("problem") or reason)

    record_tokens = _intervention_tokens(f"{project_name} {sector} {reason} {category} {challenge}")
    best_match: dict | None = None
    best_score = -1

    for intervention in interventions:
        if not isinstance(intervention, dict):
            continue
        candidate_name = str(intervention.get("project_name") or "")
        candidate_category = str(intervention.get("category") or "")
        candidate_problem = str(intervention.get("problem") or "")
        candidate_solution = str(intervention.get("solution") or "")
        candidate_tokens = _intervention_tokens(f"{candidate_name} {candidate_category} {candidate_problem} {candidate_solution}")
        overlap = len(record_tokens & candidate_tokens)
        score = overlap * 6

        if project_name and normalize_project_name(project_name) and normalize_project_name(project_name) == normalize_project_name(candidate_name):
            score += 40
        if sector and candidate_category and normalize_project_name(sector) == normalize_project_name(candidate_category):
            score += 12
        if reason and candidate_problem:
            reason_tokens = _intervention_tokens(reason)
            problem_tokens = _intervention_tokens(candidate_problem)
            score += len(reason_tokens & problem_tokens) * 4
        if challenge and candidate_problem:
            challenge_tokens = _intervention_tokens(challenge)
            score += len(challenge_tokens & _intervention_tokens(candidate_problem)) * 5

        if score > best_score:
            best_score = score
            best_match = intervention

    if best_match is None:
        fallback_problem = reason or challenge or "Execution delays, land constraint, or contract risk are emerging on the project."
        fallback_solution = "Validate the immediate bottleneck with site teams and trigger a structured mitigation plan tailored to the project’s delivery risk."
        return {
            "category": category or "Project execution risk",
            "predicted_issue": fallback_problem,
            "recommended_solution": fallback_solution,
            "confidence": 58,
            "source": "rule_based_recommendation",
            "matched_project": project_name or "project-profile",
        }

    confidence = min(96, max(62, 54 + best_score))
    return {
        "category": best_match.get("category") or category or "Project execution risk",
        "predicted_issue": best_match.get("problem") or reason or challenge or "Execution risk is emerging across the project profile.",
        "recommended_solution": best_match.get("solution") or "Validate the leading delivery bottleneck and adopt a targeted mitigation plan.",
        "confidence": int(confidence),
        "source": "teammate_interventions.json",
        "matched_project": best_match.get("project_name") or project_name or "project-profile",
    }


def merge_teammate_interventions(records: list[dict]) -> list[dict]:
    merged = [dict(record) for record in records if isinstance(record, dict)]
    existing_names = {
        normalize_project_name(record.get("name"))
        for record in merged
        if isinstance(record.get("name"), str) and normalize_project_name(record.get("name"))
    }
    intervention_seen = {
        normalize_project_name(record.get("name"))
        for record in merged
        if record.get("sourceType") == "team_intervention" and isinstance(record.get("name"), str)
    }

    for entry in load_teammate_interventions():
        project_name = entry.get("project_name")
        project_key = normalize_project_name(project_name)
        if not project_key:
            continue

        already_matched = False
        for index, record in enumerate(merged):
            record_name = record.get("name")
            if not isinstance(record_name, str):
                continue
            if normalize_project_name(record_name) != project_key:
                continue
            if record.get("sourceType") == "team_intervention":
                continue
            merged[index] = {
                **record,
                "category": entry.get("category", record.get("category")),
                "problem": entry.get("problem", record.get("problem")),
                "solution": entry.get("solution", record.get("solution")),
                "sourceType": "existing_project",
                "interventionSource": "teammate_interventions.json",
                "isInterventionOnly": False,
            }
            existing_names.add(project_key)
            already_matched = True
            break

        if already_matched:
            continue

        if project_key in intervention_seen:
            continue

        intervention_record = {
            "id": f"intervention-{project_key.replace(' ', '-') or 'project'}",
            "name": project_name,
            "category": entry.get("category"),
            "problem": entry.get("problem"),
            "solution": entry.get("solution"),
            "sourceType": "team_intervention",
            "interventionSource": "teammate_interventions.json",
            "isInterventionOnly": True,
            "status": "Intervention recommendation",
            "sector": "",
            "state": "",
            "cost": 0,
            "risk": 0,
            "time": 0,
            "progress": 0,
            "updated": "Not available",
        }
        merged.append(intervention_record)
        intervention_seen.add(project_key)

    if len(merged) != len(records):
        project_store_request("json.set", merged)
    return merged


def saved_projects() -> list[dict]:
    result = project_store_request("json.get")
    records = result if isinstance(result, list) else []
    merged = merge_teammate_interventions(records)
    if merged != records:
        project_store_request("json.set", merged)
    return merged


def admin_accounts() -> dict[str, str]:
    configured = os.getenv("ADMIN_USERS_JSON")
    if configured:
        try:
            accounts = json.loads(configured)
            if isinstance(accounts, dict) and all(isinstance(phone, str) and isinstance(prefix, str) for phone, prefix in accounts.items()):
                return {re.sub(r"\D", "", phone): prefix for phone, prefix in accounts.items()}
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail="ADMIN_USERS_JSON is invalid") from exc
    phone = re.sub(r"\D", "", os.getenv("ADMIN_PHONE", ""))
    return {phone: os.getenv("ADMIN_PASSWORD_PREFIX", "rag")} if phone else {}


def session_secret() -> bytes:
    secret = os.getenv("SESSION_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="SESSION_SECRET is not configured")
    return secret.encode("utf-8")


def create_session(phone: str) -> str:
    expires = int((datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS)).timestamp())
    payload = f"{phone}:{expires}:{secrets.token_urlsafe(12)}".encode("utf-8")
    signature = hmac.new(session_secret(), payload, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(payload + b"." + signature).decode("ascii")


def valid_session(token: str | None) -> bool:
    if not token:
        return False
    try:
        decoded = base64.urlsafe_b64decode(token.encode("ascii"))
        payload, signature = decoded.rsplit(b".", 1)
        expected = hmac.new(session_secret(), payload, hashlib.sha256).digest()
        expires = int(payload.decode("utf-8").split(":")[1])
        return hmac.compare_digest(signature, expected) and expires > int(datetime.now(timezone.utc).timestamp())
    except (ValueError, TypeError, UnicodeDecodeError, base64.binascii.Error):
        return False


def require_session(request: Request) -> None:
    if os.getenv("AUTH_DISABLED", "false").lower() == "true":
        return
    if not valid_session(request.cookies.get(SESSION_COOKIE)):
        raise HTTPException(status_code=401, detail="Authentication required")


def fetch_paimana_state_data() -> list[dict]:
    """Read the state summary embedded in the public PAIMANA portal page."""
    request = UrlRequest(
        PAIMANA_STATE_VIEW_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Referer": "https://paimana-proj.mospi.gov.in/",
        },
    )
    last_error: Exception | None = None
    for _ in range(2):
        try:
            with urlopen(request, timeout=30) as response:
                page = response.read().decode("utf-8")
            match = re.search(r"var\s+StateData\s*=\s*(\[.*?\]);", page, flags=re.DOTALL)
            if not match:
                raise ValueError("StateData was not found in the PAIMANA response")
            parsed = json.loads(match.group(1))
            if not isinstance(parsed, list):
                raise ValueError("PAIMANA StateData is not a list")
            return parsed
        except (HTTPError, URLError, TimeoutError, UnicodeDecodeError, ValueError, json.JSONDecodeError) as exc:
            last_error = exc

    raise HTTPException(
        status_code=502,
        detail="PAIMANA state data is temporarily unavailable. Please try again shortly.",
    ) from last_error


def state_payload(force_refresh: bool = False) -> dict:
    """Serve a recent official response without repeatedly calling the public portal."""
    global _state_cache, _state_cache_updated_at
    now = datetime.now(timezone.utc)
    cache_is_fresh = (
        _state_cache is not None
        and _state_cache_updated_at is not None
        and now - _state_cache_updated_at < timedelta(minutes=PAIMANA_CACHE_TTL_MINUTES)
    )
    if cache_is_fresh and not force_refresh:
        return _state_cache

    try:
        state_data = fetch_paimana_state_data()
    except HTTPException:
        if _state_cache is not None:
            return {**_state_cache, "stale": True}
        if PAIMANA_SNAPSHOT_PATH.exists():
            state_data = json.loads(PAIMANA_SNAPSHOT_PATH.read_text(encoding="utf-8"))
            national_total = next((row for row in state_data if row.get("StateId") == 0), None)
            _state_cache = {
                "source": f"{PAIMANA_STATE_VIEW_URL} (verified fallback snapshot)",
                "retrieved_at": now.isoformat(),
                "freeze_month": national_total.get("Freezmonth") if national_total else None,
                "national_total": national_total,
                "states": [row for row in state_data if row.get("StateId") != 0],
                "stale": True,
            }
            _state_cache_updated_at = now
            return _state_cache
        raise

    national_total = next((row for row in state_data if row.get("StateId") == 0), None)
    _state_cache = {
        "source": PAIMANA_STATE_VIEW_URL,
        "retrieved_at": now.isoformat(),
        "freeze_month": national_total.get("Freezmonth") if national_total else None,
        "national_total": national_total,
        "states": [row for row in state_data if row.get("StateId") != 0],
        "stale": False,
    }
    _state_cache_updated_at = now
    return _state_cache


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "PAIMANA Prism API is running"}


@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response) -> dict[str, str]:
    if os.getenv("AUTH_DISABLED", "false").lower() == "true":
        return {"message": "Authentication temporarily disabled"}
    entered_phone = re.sub(r"\D", "", payload.phone)
    password_prefix = admin_accounts().get(entered_phone)
    expected_password = f"{password_prefix}{entered_phone[-4:]}" if password_prefix else ""
    if not password_prefix:
        raise HTTPException(status_code=500, detail="Admin phone is not configured on the server")
    if not hmac.compare_digest(payload.password, expected_password):
        raise HTTPException(status_code=401, detail="Invalid phone number or password")
    response.set_cookie(SESSION_COOKIE, create_session(entered_phone), max_age=SESSION_TTL_HOURS * 60 * 60, httponly=True, samesite="lax", secure=os.getenv("COOKIE_SECURE", "false").lower() == "true")
    return {"message": "Authenticated"}


@app.get("/api/auth/me")
def current_session(request: Request) -> dict[str, bool]:
    if os.getenv("AUTH_DISABLED", "false").lower() == "true":
        return {"authenticated": True}
    return {"authenticated": valid_session(request.cookies.get(SESSION_COOKIE))}


@app.post("/api/auth/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(SESSION_COOKIE)
    return {"message": "Logged out"}


@app.get("/api/projects")
def get_projects(request: Request) -> list[dict]:
    require_session(request)
    return saved_projects()


@app.post("/api/projects")
def add_project(project: ProjectRecord, request: Request) -> ProjectRecord:
    require_session(request)
    records = saved_projects()
    records = [record for record in records if record.get("id") != project.id]
    records.insert(0, project.model_dump())
    project_store_request("json.set", records)
    return project


@app.put("/api/projects/{project_id}")
def update_project(project_id: str, project: ProjectRecord, request: Request) -> ProjectRecord:
    require_session(request)
    if project.id != project_id:
        raise HTTPException(status_code=400, detail="Project ID cannot be changed during an edit")
    records = saved_projects()
    if not any(record.get("id") == project_id for record in records):
        raise HTTPException(status_code=404, detail="Project was not found")
    updated = [project.model_dump() if record.get("id") == project_id else record for record in records]
    project_store_request("json.set", updated)
    return project


@app.post("/api/risk/score")
def risk_score(payload: RiskRequest, request: Request) -> dict:
    require_session(request)
    result = score_record(payload.record, payload.history)
    result["recommendation"] = generate_intervention_recommendation(payload.record)
    return result


@app.post("/api/risk/train")
def risk_train(payload: list[dict], request: Request) -> dict:
    require_session(request)
    result = train_from_history(payload)
    return {key: value for key, value in result.items() if key not in {"cost_model", "time_model"}}


@app.get("/api/paimana/states")
def get_paimana_states(request: Request, refresh: bool = False) -> dict:
    """Return the latest official state/UT figures displayed on PAIMANA."""
    require_session(request)
    return state_payload(force_refresh=refresh)


@app.get("/api/paimana/health")
def paimana_health(request: Request) -> dict:
    """Report whether this process has successfully reached PAIMANA."""
    require_session(request)
    return {
        "source": PAIMANA_STATE_VIEW_URL,
        "cached": _state_cache is not None,
        "last_successful_fetch": _state_cache_updated_at.isoformat() if _state_cache_updated_at else None,
    }

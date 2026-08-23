import json
import base64
import hashlib
import hmac
import os
import re
import secrets
from pathlib import Path
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from backend.risk_model import score_record, train_from_history

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
    progress: int = 0
    updated: str = "Just now"


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


def saved_projects() -> list[dict]:
    result = project_store_request("json.get")
    return result if isinstance(result, list) else []


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
    return score_record(payload.record, payload.history)


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

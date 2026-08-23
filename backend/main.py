import json
import base64
import hashlib
import hmac
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="PAIMANA Prism API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
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
    if not valid_session(request.cookies.get(SESSION_COOKIE)):
        raise HTTPException(status_code=401, detail="Authentication required")


def fetch_paimana_state_data() -> list[dict]:
    """Read the state summary embedded in the public PAIMANA portal page."""
    request = Request(
        PAIMANA_STATE_VIEW_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; PAIMANA-Prism/1.0)",
            "Accept": "text/html,application/xhtml+xml",
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
    configured_phone = os.getenv("ADMIN_PHONE")
    if not configured_phone:
        raise HTTPException(status_code=500, detail="Admin phone is not configured on the server")
    if not hmac.compare_digest(payload.phone.strip(), configured_phone):
        raise HTTPException(status_code=401, detail="Invalid phone number")
    response.set_cookie(
        SESSION_COOKIE,
        create_session(configured_phone),
        max_age=SESSION_TTL_HOURS * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
    )
    return {"message": "Authenticated"}


@app.get("/api/auth/me")
def current_session(request: Request) -> dict[str, bool]:
    return {"authenticated": valid_session(request.cookies.get(SESSION_COOKIE))}


@app.post("/api/auth/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie(SESSION_COOKIE)
    return {"message": "Logged out"}


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

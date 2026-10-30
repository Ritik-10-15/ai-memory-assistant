"""
app_instance.py — creates the Flask app object only.

Kept separate from app.py so routes.py can `from app_instance import app`
without circularly importing app.py itself.
"""
import logging
import os
from datetime import timedelta

from flask import Flask, request
from werkzeug.middleware.proxy_fix import ProxyFix
import config

# One log format for every module (gunicorn's access log is separate).
# Status messages only: no names, embeddings, transcripts or secrets.
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper(),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# static_folder=None: the React build is served explicitly by routes.py.
app = Flask(__name__, static_folder=None)
app.secret_key = config.SECRET_KEY
# The patient screen is a dedicated device: keep its PIN sign-in for a year.
app.permanent_session_lifetime = timedelta(days=365)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    # Lax: the session cookie isn't sent on cross-site POSTs (CSRF defence
    # for the form and JSON endpoints).
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=config.SECURE_COOKIES,
    MAX_CONTENT_LENGTH=40 * 1024 * 1024,   # photo batches / audio uploads
)

# Behind a reverse proxy (Caddy on AWS) the client address arrives in
# X-Forwarded-For; trust exactly one proxy hop so per-client login
# throttling sees real addresses.
if config.TRUST_PROXY:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# Host-header check (Flask's TRUSTED_HOSTS). localhost stays allowed for the
# container's own health check.
if config.ALLOWED_HOSTS:
    app.config["TRUSTED_HOSTS"] = [*config.ALLOWED_HOSTS, "localhost", "127.0.0.1"]

# Browser hardening on every response (OWASP ASVS V14.4). The React build
# has no inline scripts and loads nothing from other origins, so scripts are
# limited to this site. Inline *styles* stay allowed: charts and layout set
# style attributes. Blob URLs are previews of photos being uploaded.
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])


@app.after_request
def security_headers(resp):
    h = resp.headers
    h.setdefault("Content-Security-Policy", CSP)
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("X-Frame-Options", "DENY")              # clickjacking (older browsers)
    h.setdefault("Referrer-Policy", "same-origin")
    h.setdefault("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()")
    if config.SECURE_COOKIES:                            # only when served over HTTPS
        h.setdefault("Strict-Transport-Security", "max-age=31536000")
    # Private data must not be kept in shared or back/forward caches. Photos
    # set their own "private" caching.
    if request.path.startswith("/api/") and resp.mimetype == "application/json":
        h["Cache-Control"] = "no-store"
    return resp

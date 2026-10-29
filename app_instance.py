"""
app_instance.py — creates the Flask app object only.

Kept separate from app.py so routes.py can `from app_instance import app`
without circularly importing app.py itself.
"""
from datetime import timedelta

from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix
import config

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
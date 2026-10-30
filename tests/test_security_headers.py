"""Browser hardening headers (Phase 6 audit, D5)."""
import config


def test_pages_and_api_send_hardening_headers(client):
    for path in ("/welcome", "/api/session"):
        h = client.get(path).headers
        assert "frame-ancestors 'none'" in h["Content-Security-Policy"]
        assert "script-src 'self'" in h["Content-Security-Policy"]
        assert h["X-Content-Type-Options"] == "nosniff"
        assert h["X-Frame-Options"] == "DENY"
        assert h["Referrer-Policy"] == "same-origin"
        assert "geolocation=()" in h["Permissions-Policy"]


def test_private_api_responses_are_not_cached(client):
    assert client.get("/api/session").headers["Cache-Control"] == "no-store"
    assert client.get("/api/family").headers["Cache-Control"] == "no-store"


def test_hsts_only_over_https(client, monkeypatch):
    assert "Strict-Transport-Security" not in client.get("/welcome").headers
    monkeypatch.setattr(config, "SECURE_COOKIES", True)
    assert client.get("/welcome").headers["Strict-Transport-Security"].startswith("max-age=")


def test_requests_for_other_host_names_are_refused_when_hosts_are_listed(client, monkeypatch):
    """Phase 9: ALLOWED_HOSTS → Flask TRUSTED_HOSTS."""
    import app_instance
    monkeypatch.setitem(app_instance.app.config, "TRUSTED_HOSTS", ["memory.example.org", "localhost"])
    assert client.get("/healthz", base_url="http://memory.example.org").status_code == 200
    assert client.get("/healthz", base_url="http://evil.example.net").status_code == 400

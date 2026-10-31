"""
wsgi.py — production entry point (used by gunicorn in the Docker image).

    gunicorn --workers 1 --threads 8 wsgi:app

Run exactly ONE worker process: the recognition state (worker.detection,
the frame queue, the visit tracker) lives in process memory, so a second
process would have its own camera state and the patient screen would
flicker between them. Threads give the concurrency instead.
"""
import logging
import os
import sys

import config
from app import app, startup  # noqa: F401  (gunicorn loads wsgi:app)

log = logging.getLogger(__name__)

# Refuse to serve real patient data behind the publicly-known defaults.
# Exit code 3 is gunicorn's "worker failed to boot": it stops the server
# instead of restarting the worker in an endless loop.
if config.SANDBOX_MODE:
    # Visitors sign in with their own accounts; there is no shared password or PIN.
    if "SECRET_KEY" not in os.environ or config.CAMERA_MODE != "browser":
        log.critical("Sandbox mode needs SECRET_KEY and CAMERA_MODE=browser.")
        sys.exit(3)
elif (config.CAREGIVER_PASS == "caregiver123" or "SECRET_KEY" not in os.environ
        or not config.PATIENT_PIN):
    log.critical("Set CAREGIVER_PASSWORD, PATIENT_PIN and SECRET_KEY environment "
                 "variables before running in production.")
    sys.exit(3)

startup()

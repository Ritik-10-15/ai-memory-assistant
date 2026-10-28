"""
app_instance.py — creates the Flask app object only.

Kept separate from app.py so routes.py can `from app_instance import app`
without circularly importing app.py itself.
"""
from datetime import timedelta

from flask import Flask
import config

app = Flask(__name__)
app.secret_key = config.SECRET_KEY
# The patient screen is a dedicated device: keep its PIN sign-in for a year.
app.permanent_session_lifetime = timedelta(days=365)
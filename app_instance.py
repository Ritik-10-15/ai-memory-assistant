"""
app_instance.py — creates the Flask app object only.

Kept separate from app.py so routes.py can `from app_instance import app`
without circularly importing app.py itself.
"""
from flask import Flask
import config

app = Flask(__name__)
app.secret_key = config.SECRET_KEY
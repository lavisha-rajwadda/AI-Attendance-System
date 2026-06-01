# routers/__init__.py
# Exposes router modules for import in main.py
from routers import auth, subjects, attendance

__all__ = ["auth", "subjects", "attendance"]

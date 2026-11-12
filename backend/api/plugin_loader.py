"""
Zero-Conflict Feature Router Auto-Loader (`backend/api/plugin_loader.py`).

Automatically imports every module inside `backend/api/features/` (excluding `_`-prefixed files)
and registers its `router: APIRouter` on the FastAPI app. Allows multiple engineers to ship
independent feature PRs without modifying `backend/main.py`.
"""

from __future__ import annotations
import importlib.util
import os
from typing import List, Optional
from fastapi import APIRouter, FastAPI


def register_feature_plugins(
    app: FastAPI, features_dir: Optional[str] = None
) -> List[str]:
    target_dir = features_dir or os.path.join(os.path.dirname(__file__), "features")
    if not os.path.isdir(target_dir):
        return []

    mounted: List[str] = []
    for fname in sorted(os.listdir(target_dir)):
        if not fname.endswith(".py") or fname.startswith("_"):
            continue
        mod_name = fname[:-3]
        file_path = os.path.join(target_dir, fname)
        spec = importlib.util.spec_from_file_location(f"api.features.{mod_name}", file_path)
        if spec and spec.loader:
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            router = getattr(mod, "router", None)
            if isinstance(router, APIRouter):
                app.include_router(router)
                mounted.append(mod_name)
    return mounted

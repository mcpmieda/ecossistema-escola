#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path


def load_guard():
    """Load the shared bounded-agent validation module."""
    path = Path(__file__).parent / "antigravity" / "run.py"
    spec = importlib.util.spec_from_file_location("agent_guard", path)
    if spec is None or spec.loader is None:
        raise SystemExit("Unable to load agent guard.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    """Validate a delegated worktree and emit a machine-readable result."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--meta", required=True)
    parser.add_argument("--result", required=True)
    parser.add_argument(
        "--paths-only",
        action="store_true",
        help="Validate changed paths without executing delegated validation commands.",
    )
    args = parser.parse_args()

    guard = load_guard()
    root = Path(args.root).resolve()
    meta = json.loads(Path(args.meta).read_text(encoding="utf-8"))

    paths = guard.list_changed_paths(root)
    guard.validate_changed_paths(paths, meta["allowed_paths"])
    if not args.paths_only:
        guard.run_validations(root, meta["validate"])
        paths = guard.list_changed_paths(root)
        guard.validate_changed_paths(paths, meta["allowed_paths"])

    Path(args.result).write_text(
        json.dumps({"has_changes": bool(paths), "changed_paths": paths}, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import os
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


def trusted_runner_path(raw_path: str, *, must_exist: bool) -> Path:
    """Resolve a CLI path and require it to stay inside GitHub RUNNER_TEMP."""
    runner_temp_value = os.environ.get("RUNNER_TEMP", "").strip()
    if not runner_temp_value:
        raise SystemExit("RUNNER_TEMP is required.")

    runner_temp = Path(runner_temp_value).resolve(strict=True)
    candidate = Path(raw_path).resolve(strict=must_exist)
    if candidate == runner_temp or runner_temp not in candidate.parents:
        raise SystemExit("Refusing a runtime path outside RUNNER_TEMP.")
    if must_exist and not candidate.is_file():
        raise SystemExit("Trusted runtime input must be a file.")
    return candidate


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
    meta_path = trusted_runner_path(args.meta, must_exist=True)
    result_path = trusted_runner_path(args.result, must_exist=False)
    meta = json.loads(meta_path.read_text(encoding="utf-8"))

    paths = guard.list_changed_paths(root)
    guard.validate_changed_paths(paths, meta["allowed_paths"])
    if not args.paths_only:
        guard.run_validations(root, meta["validate"])
        paths = guard.list_changed_paths(root)
        guard.validate_changed_paths(paths, meta["allowed_paths"])

    result_path.write_text(
        json.dumps({"has_changes": bool(paths), "changed_paths": paths}, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()

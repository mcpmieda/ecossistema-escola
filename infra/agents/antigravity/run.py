#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
from typing import Any

HANDOFF_BEGIN = "<!-- AGENT_HANDOFF_BEGIN -->"
HANDOFF_END = "<!-- AGENT_HANDOFF_END -->"
SCHEMA_VERSION = 1
MAX_ALLOWED_PATHS = 40
MAX_VALIDATE_COMMANDS = 12
MAX_PROMPT_CHARS = 30_000
HARD_FORBIDDEN = (
    ".github/**",
    "AGENTS.md",
    ".env",
    ".env.*",
    "infra/agents/**",
    "docs/gradebook/PROJECT_STATE.yaml",
)
FORBIDDEN_COMMAND_FRAGMENTS = (
    "curl ",
    "wget ",
    "ssh ",
    "scp ",
    "rsync ",
    "sudo ",
    "git push",
    "gh ",
    "rm -rf",
    "printenv",
    " env",
    "set |",
    "export ",
)


def fail(message: str) -> "NoReturn":
    raise SystemExit(message)


def load_issue(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        fail("Issue payload must be a JSON object.")
    return data


def extract_handoff(body: str) -> dict[str, Any]:
    start = body.find(HANDOFF_BEGIN)
    end = body.find(HANDOFF_END)
    if start < 0 or end < 0 or end <= start:
        fail("Missing AGENT_HANDOFF markers.")
    raw = body[start + len(HANDOFF_BEGIN) : end].strip()
    try:
        handoff = json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"Invalid AGENT_HANDOFF JSON: {exc}")
    if not isinstance(handoff, dict):
        fail("AGENT_HANDOFF must be a JSON object.")
    return handoff


def clean_string_list(value: Any, field: str, limit: int) -> list[str]:
    if not isinstance(value, list) or not value:
        fail(f"{field} must be a non-empty array.")
    if len(value) > limit:
        fail(f"{field} exceeds the maximum of {limit} entries.")
    cleaned: list[str] = []
    for entry in value:
        if not isinstance(entry, str) or not entry.strip():
            fail(f"{field} contains an invalid entry.")
        cleaned.append(entry.strip())
    return cleaned


def normalize_allowed_pattern(pattern: str) -> str:
    value = pattern.replace("\\", "/").strip()
    if value.startswith("/") or value.startswith("~") or ".." in Path(value).parts:
        fail(f"Unsafe allowed path: {pattern}")
    return value.rstrip("/")


def matches(pattern: str, path: str) -> bool:
    if any(ch in pattern for ch in "*?["):
        return fnmatch.fnmatch(path, pattern)
    return path == pattern or path.startswith(pattern + "/")


def validate_handoff(handoff: dict[str, Any]) -> dict[str, Any]:
    if handoff.get("schema_version") != SCHEMA_VERSION:
        fail(f"schema_version must be {SCHEMA_VERSION}.")

    leader = handoff.get("leader")
    goal = handoff.get("goal")
    if not isinstance(leader, str) or not leader.strip():
        fail("leader is required.")
    if not isinstance(goal, str) or not goal.strip():
        fail("goal is required.")

    allowed_paths = [
        normalize_allowed_pattern(value)
        for value in clean_string_list(
            handoff.get("allowed_paths"), "allowed_paths", MAX_ALLOWED_PATHS
        )
    ]
    for allowed in allowed_paths:
        for forbidden in HARD_FORBIDDEN:
            if matches(forbidden, allowed) or matches(allowed, forbidden.replace("/**", "")):
                fail(f"Sensitive path cannot be delegated: {allowed}")

    preserve = clean_string_list(handoff.get("preserve"), "preserve", 30)
    do_not = clean_string_list(handoff.get("do_not"), "do_not", 30)
    validate = clean_string_list(handoff.get("validate"), "validate", MAX_VALIDATE_COMMANDS)

    for command in validate:
        try:
            shlex.split(command)
        except ValueError as exc:
            fail(f"Invalid validation command {command!r}: {exc}")
        if not validation_command_is_safe(command):
            fail(f"Unsafe validation command: {command}")

    return {
        "schema_version": SCHEMA_VERSION,
        "leader": leader.strip(),
        "goal": goal.strip(),
        "allowed_paths": allowed_paths,
        "preserve": preserve,
        "do_not": do_not,
        "validate": validate,
    }


def write_meta(issue: dict[str, Any], handoff: dict[str, Any], meta_path: Path) -> None:
    number = issue.get("number")
    title = issue.get("title")
    html_url = issue.get("html_url")
    if not isinstance(number, int) or not isinstance(title, str):
        fail("Issue metadata is incomplete.")
    canonical = json.dumps(handoff, sort_keys=True, separators=(",", ":")).encode("utf-8")
    meta = {
        **handoff,
        "handoff_hash": hashlib.sha256(canonical).hexdigest(),
        "issue_number": number,
        "issue_title": title,
        "issue_url": html_url if isinstance(html_url, str) else "",
        "needs_node": any(
            command.startswith(("npm ", "node ", "npx "))
            for command in handoff["validate"]
        ),
    }
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def validation_command_is_safe(command: str) -> bool:
    normalized = command.strip()
    lowered = f" {normalized.lower()} "
    if any(fragment in lowered for fragment in FORBIDDEN_COMMAND_FRAGMENTS):
        return False
    if normalized == "git diff --check":
        return True
    safe_prefixes = (
        "npm run ",
        "npm test",
        "npx vitest ",
        "node --test",
    )
    return normalized.startswith(safe_prefixes)


def run_validations(root: Path, commands: list[str]) -> None:
    for command in commands:
        if not validation_command_is_safe(command):
            fail(f"Unsafe validation command: {command}")
        argv = shlex.split(command)
        subprocess.run(argv, cwd=root, check=True, env=os.environ.copy())


def list_changed_paths(root: Path) -> list[str]:
    subprocess.run(
        ["git", "add", "-N", "."],
        cwd=root,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    output = subprocess.run(
        ["git", "diff", "--no-renames", "--name-only", "--diff-filter=ACMRDTUXB"],
        cwd=root,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ).stdout
    return sorted({line.strip().replace("\\", "/") for line in output.splitlines() if line.strip()})


def validate_changed_paths(paths: list[str], allowed_paths: list[str]) -> None:
    violations: list[str] = []
    for path in paths:
        if any(matches(pattern, path) for pattern in HARD_FORBIDDEN):
            violations.append(path)
            continue
        if not any(matches(pattern, path) for pattern in allowed_paths):
            violations.append(path)
    if violations:
        fail("Antigravity changed files outside the delegated scope: " + ", ".join(violations))


def build_prompt(meta: dict[str, Any]) -> str:
    preserve = "\n".join(f"- {item}" for item in meta["preserve"])
    do_not = "\n".join(f"- {item}" for item in meta["do_not"])
    allowed = "\n".join(f"- {item}" for item in meta["allowed_paths"])
    validate = "\n".join(f"- {item}" for item in meta["validate"])
    prompt = f"""You are an implementation executor working under a lead agent.

Issue: #{meta['issue_number']} — {meta['issue_title']}
Goal:
{meta['goal']}

Allowed paths:
{allowed}

Preserve:
{preserve}

Do not:
{do_not}

Host-side validation commands (you must not run these yourself):
{validate}

Implement only the delegated scope. Do not make architectural decisions, expand contracts, change business or academic rules, or modify files outside Allowed paths. If the task cannot be completed without doing one of those things, do not improvise: stop and explain the blocker in your final response.

Do not use network access, terminal commands, environment variables or credentials. Do not use git/gh, and do not create commits or branches. The host workflow will run validation commands after your execution, review scope, and publish a draft PR if the result is valid.
"""
    if len(prompt) > MAX_PROMPT_CHARS:
        fail("Generated Antigravity prompt is too large.")
    return prompt


async def execute_agent(root: Path, meta: dict[str, Any], summary_path: Path) -> None:
    api_key = os.environ.pop("GEMINI_API_KEY", "").strip()
    if not api_key:
        fail("GEMINI_API_KEY is not configured.")

    from google.antigravity import Agent, LocalAgentConfig, types  # type: ignore[import-not-found]
    from google.antigravity.hooks import policy  # type: ignore[import-not-found]

    capabilities = types.CapabilitiesConfig(
        enable_subagents=False,
        enabled_tools=[
            types.BuiltinTools.LIST_DIR,
            types.BuiltinTools.SEARCH_DIR,
            types.BuiltinTools.FIND_FILE,
            types.BuiltinTools.VIEW_FILE,
            types.BuiltinTools.CREATE_FILE,
            types.BuiltinTools.EDIT_FILE,
            types.BuiltinTools.FINISH,
        ],
        tool_output_truncation_config=types.ToolOutputTruncationConfig(max_tokens=5000),
    )
    policies = [
        policy.deny_all(),
        policy.allow("list_directory"),
        policy.allow("search_directory"),
        policy.allow("find_file"),
        policy.allow("view_file"),
        policy.allow("create_file"),
        policy.allow("edit_file"),
        policy.allow("finish"),
    ]

    agents_rules = (root / "AGENTS.md").read_text(encoding="utf-8")
    system_instructions = f"""Follow the repository governance below as binding instructions.

--- AGENTS.md ---
{agents_rules}
--- END AGENTS.md ---

You are an executor, not the architectural authority. Stay inside the current workspace and the delegated handoff. Never read secrets or environment variables. Never publish with git or GitHub. Network tools and subagents are unavailable by design.
"""

    config = LocalAgentConfig(
        api_key=api_key,
        model="gemini-3.8-flash",
        workspaces=[str(root)],
        system_instructions=system_instructions,
        capabilities=capabilities,
        policies=policies,
        budget_config=types.BudgetConfig(
            max_model_calls=12,
            max_tool_calls=80,
            max_total_tokens=60_000,
        ),
        compaction_config=types.CompactionConfig(token_threshold=30_000),
    )

    os.chdir(root)
    async with Agent(config) as agent:
        response = await agent.chat(build_prompt(meta))
        response_text = await response.text()
        usage = getattr(response, "usage_metadata", None)
        usage_payload = usage.model_dump() if hasattr(usage, "model_dump") else None
        result = {
            "response": response_text,
            "usage": usage_payload,
            "conversation_id": getattr(agent, "conversation_id", None),
        }
        summary_path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def command_sdk_check(args: argparse.Namespace) -> None:
    from google.antigravity import LocalAgentConfig, types  # type: ignore[import-not-found]
    from google.antigravity.hooks import policy  # type: ignore[import-not-found]

    capabilities = types.CapabilitiesConfig(
        enable_subagents=False,
        enabled_tools=[
            types.BuiltinTools.LIST_DIR,
            types.BuiltinTools.SEARCH_DIR,
            types.BuiltinTools.FIND_FILE,
            types.BuiltinTools.VIEW_FILE,
            types.BuiltinTools.CREATE_FILE,
            types.BuiltinTools.EDIT_FILE,
            types.BuiltinTools.FINISH,
        ],
        tool_output_truncation_config=types.ToolOutputTruncationConfig(max_tokens=5000),
    )
    LocalAgentConfig(
        api_key="sdk-check-only",
        model="gemini-3.8-flash",
        workspaces=[str(Path.cwd())],
        system_instructions="SDK compatibility check only.",
        capabilities=capabilities,
        policies=[
            policy.deny_all(),
            policy.allow("list_directory"),
            policy.allow("search_directory"),
            policy.allow("find_file"),
            policy.allow("view_file"),
            policy.allow("create_file"),
            policy.allow("edit_file"),
            policy.allow("finish"),
        ],
        budget_config=types.BudgetConfig(
            max_model_calls=12,
            max_tool_calls=80,
            max_total_tokens=60_000,
        ),
        compaction_config=types.CompactionConfig(token_threshold=30_000),
    )
    print("Antigravity SDK configuration is compatible.")


def command_check(args: argparse.Namespace) -> None:
    issue = load_issue(Path(args.issue_json))
    body = issue.get("body")
    if not isinstance(body, str):
        fail("Issue body is missing.")
    handoff = validate_handoff(extract_handoff(body))
    write_meta(issue, handoff, Path(args.meta))


def command_run(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    meta = json.loads(Path(args.meta).read_text(encoding="utf-8"))
    summary_path = Path(args.summary)
    asyncio.run(execute_agent(root, meta, summary_path))
    paths = list_changed_paths(root)
    validate_changed_paths(paths, meta["allowed_paths"])
    run_validations(root, meta["validate"])
    paths = list_changed_paths(root)
    validate_changed_paths(paths, meta["allowed_paths"])
    result = {
        "has_changes": bool(paths),
        "changed_paths": paths,
    }
    Path(args.result).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    sdk_check = subparsers.add_parser("sdk-check")
    sdk_check.set_defaults(func=command_sdk_check)

    check = subparsers.add_parser("check")
    check.add_argument("--issue-json", required=True)
    check.add_argument("--meta", required=True)
    check.set_defaults(func=command_check)

    run = subparsers.add_parser("run")
    run.add_argument("--root", default=".")
    run.add_argument("--meta", required=True)
    run.add_argument("--summary", required=True)
    run.add_argument("--result", required=True)
    run.set_defaults(func=command_run)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()

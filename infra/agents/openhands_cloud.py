#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


TERMINAL_STATUSES = {"STOPPED", "FAILED", "ERROR", "CANCELLED"}
DEFAULT_BASE_URL = "https://app.all-hands.dev"
MAX_PROMPT_CHARS = 30_000


def api_request(
    method: str,
    path: str,
    api_key: str,
    payload: dict[str, object] | None = None,
) -> dict[str, object]:
    """Send one authenticated request to the fixed OpenHands Cloud API host."""
    if not path.startswith("/api/"):
        raise SystemExit("Refusing an unexpected OpenHands API path.")
    url = f"{DEFAULT_BASE_URL}{path}"
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        raise SystemExit(f"OpenHands API request failed with HTTP {exc.code}.") from exc
    except URLError as exc:
        raise SystemExit("OpenHands API request failed due to a network error.") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit("OpenHands API returned invalid JSON.") from exc
    if not isinstance(data, dict):
        raise SystemExit("OpenHands API returned an unexpected payload.")
    return data


def trusted_runner_file(raw_path: str) -> Path:
    """Resolve an input file and require it to stay inside GitHub RUNNER_TEMP."""
    runner_temp_value = os.environ.get("RUNNER_TEMP", "").strip()
    if not runner_temp_value:
        raise SystemExit("RUNNER_TEMP is required.")
    runner_temp = Path(runner_temp_value).resolve(strict=True)
    candidate = Path(raw_path).resolve(strict=True)
    if runner_temp not in candidate.parents or not candidate.is_file():
        raise SystemExit("Refusing a runtime input outside RUNNER_TEMP.")
    return candidate


def build_prompt(meta: dict[str, object]) -> str:
    """Render the bounded task prompt from already validated handoff metadata."""
    def bullets(name: str) -> str:
        value = meta.get(name)
        if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
            raise SystemExit(f"Invalid {name} metadata.")
        return "\n".join(f"- {item}" for item in value)

    issue_number = meta.get("issue_number")
    issue_title = meta.get("issue_title")
    goal = meta.get("goal")
    if not isinstance(issue_number, int) or not isinstance(issue_title, str) or not isinstance(goal, str):
        raise SystemExit("OpenHands metadata is incomplete.")

    prompt = f"""You are OpenHands, an implementation executor working under ChatGPT leadership.

Read AGENTS.md before doing anything else.

Issue #{issue_number} — {issue_title}

Goal:
{goal}

Allowed paths:
{bullets("allowed_paths")}

Preserve:
{bullets("preserve")}

Do not:
{bullets("do_not")}

Validation commands:
{bullets("validate")}

Rules:
- Work only on the delegated task and allowed paths.
- Never read, print, infer, copy, or expose secrets, credentials, environment variables, student data, or private production data.
- Do not merge to main and do not deploy.
- If code changes are needed, create only a candidate branch or pull request through the connected OpenHands GitHub integration.
- If the task requires anything outside Allowed paths or an architectural decision, stop and explain the blocker instead of expanding scope.
"""
    if len(prompt) > MAX_PROMPT_CHARS:
        raise SystemExit("Generated OpenHands prompt is too large.")
    return prompt


def write_outputs(values: dict[str, str]) -> None:
    """Append sanitized scalar outputs for downstream GitHub Actions jobs."""
    output_path = os.environ.get("GITHUB_OUTPUT", "").strip()
    if not output_path:
        return
    with open(output_path, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            safe_value = value.replace("\n", " ").replace("\r", " ")
            handle.write(f"{key}={safe_value}\n")


def run_conversation(args: argparse.Namespace) -> None:
    """Create and poll one bounded OpenHands Cloud conversation."""
    api_key = os.environ.get("OPENHANDS_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("OPENHANDS_API_KEY is not configured.")

    meta_path = trusted_runner_file(args.meta)
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    if not isinstance(meta, dict):
        raise SystemExit("OpenHands metadata must be a JSON object.")

    payload: dict[str, object] = {
        "initial_user_msg": build_prompt(meta),
        "repository": args.repository,
        "selected_branch": args.branch,
    }
    created = api_request("POST", "/api/conversations", api_key, payload)

    conversation_id = str(created.get("conversation_id") or created.get("id") or "").strip()
    if not conversation_id:
        raise SystemExit("OpenHands API did not return a conversation id.")

    status = str(created.get("status") or "UNKNOWN").upper()
    conversation_url = f"{DEFAULT_BASE_URL}/conversations/{conversation_id}"
    print(f"OpenHands conversation: {conversation_url}")
    deadline = time.monotonic() + args.timeout_seconds

    while status not in TERMINAL_STATUSES and time.monotonic() < deadline:
        time.sleep(args.poll_interval_seconds)
        current = api_request("GET", f"/api/conversations/{conversation_id}", api_key)
        status = str(current.get("status") or "UNKNOWN").upper()
        print(f"OpenHands status: {status}")

    write_outputs(
        {
            "conversation_id": conversation_id,
            "status": status,
            "conversation_url": conversation_url,
        }
    )

    if status in {"FAILED", "ERROR", "CANCELLED"}:
        raise SystemExit(f"OpenHands conversation ended with status {status}.")
    if status not in TERMINAL_STATUSES:
        raise SystemExit("OpenHands conversation polling timed out.")


def main() -> None:
    """Parse host-controlled inputs and execute the cloud conversation."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--meta", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--timeout-seconds", type=int, default=1200)
    parser.add_argument("--poll-interval-seconds", type=int, default=30)
    args = parser.parse_args()
    run_conversation(args)


if __name__ == "__main__":
    main()

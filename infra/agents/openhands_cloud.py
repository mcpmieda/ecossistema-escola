#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "https://app.all-hands.dev"
MAX_PROMPT_CHARS = 30_000
START_TERMINAL = {"READY", "ERROR"}
EXECUTION_FAILURES = {"error", "stuck", "paused", "waiting_for_confirmation"}


def api_request(
    method: str,
    path: str,
    api_key: str,
    payload: dict[str, object] | None = None,
) -> object:
    """Send one authenticated request to the fixed OpenHands Cloud v1 API."""
    if not path.startswith("/api/v1/"):
        raise SystemExit("Refusing an unexpected OpenHands API path.")
    url = f"{DEFAULT_BASE_URL}{path}"
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=body,
        method=method,
        headers={
            "X-Access-Token": api_key,
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
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit("OpenHands API returned invalid JSON.") from exc


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
    if (
        not isinstance(issue_number, int)
        or not isinstance(issue_title, str)
        or not isinstance(goal, str)
    ):
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


def get_single_item(
    api_key: str,
    path: str,
    *,
    label: str,
) -> dict[str, object]:
    """Fetch an API list expected to contain exactly one non-null object."""
    response = api_request("GET", path, api_key)
    if not isinstance(response, list) or len(response) != 1 or not isinstance(response[0], dict):
        raise SystemExit(f"OpenHands API returned an unexpected {label} payload.")
    return response[0]


def wait_for_start_task(
    api_key: str,
    task_id: str,
    *,
    deadline: float,
    poll_interval_seconds: int,
) -> str:
    """Wait for the Cloud start task and return its app conversation id."""
    status = "WORKING"
    while status not in START_TERMINAL and time.monotonic() < deadline:
        query = urlencode({"ids": task_id})
        task = get_single_item(
            api_key,
            f"/api/v1/app-conversations/start-tasks?{query}",
            label="start-task",
        )
        status = str(task.get("status") or "WORKING").upper()
        print(f"OpenHands start status: {status}")
        if status in START_TERMINAL:
            if status == "ERROR":
                raise SystemExit("OpenHands conversation start task failed.")
            conversation_id = str(task.get("app_conversation_id") or "").strip()
            if not conversation_id:
                raise SystemExit("OpenHands READY task did not return a conversation id.")
            return conversation_id
        time.sleep(poll_interval_seconds)
    raise SystemExit("OpenHands conversation start timed out.")


def wait_for_execution(
    api_key: str,
    conversation_id: str,
    *,
    deadline: float,
    poll_interval_seconds: int,
) -> tuple[str, str]:
    """Wait for agent execution to finish and return status plus UI URL."""
    seen_running = False
    conversation_url = f"{DEFAULT_BASE_URL}/conversations/{conversation_id}"

    while time.monotonic() < deadline:
        query = urlencode({"ids": conversation_id})
        conversation = get_single_item(
            api_key,
            f"/api/v1/app-conversations?{query}",
            label="conversation",
        )
        reported_url = conversation.get("conversation_url")
        if isinstance(reported_url, str) and reported_url.startswith("https://"):
            conversation_url = reported_url

        execution_status = str(conversation.get("execution_status") or "").lower()
        sandbox_status = str(conversation.get("sandbox_status") or "").upper()
        print(
            "OpenHands execution status: "
            f"{execution_status or 'pending'} (sandbox={sandbox_status or 'unknown'})"
        )

        if execution_status == "running":
            seen_running = True
        elif execution_status == "finished":
            return execution_status, conversation_url
        elif seen_running and execution_status == "idle":
            return execution_status, conversation_url
        elif execution_status in EXECUTION_FAILURES:
            raise SystemExit(f"OpenHands execution ended with status {execution_status}.")
        elif sandbox_status == "ERROR":
            raise SystemExit("OpenHands sandbox entered ERROR state.")

        time.sleep(poll_interval_seconds)

    raise SystemExit("OpenHands agent execution timed out.")


def run_conversation(args: argparse.Namespace) -> None:
    """Create and poll one bounded OpenHands Cloud conversation."""
    api_key = os.environ.get("OPENHANDS_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("OPENHANDS_API_KEY is not configured.")

    meta_path = trusted_runner_file(args.meta)
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    if not isinstance(meta, dict):
        raise SystemExit("OpenHands metadata must be a JSON object.")

    issue_number = meta.get("issue_number")
    issue_title = meta.get("issue_title")
    if not isinstance(issue_number, int) or not isinstance(issue_title, str):
        raise SystemExit("OpenHands issue metadata is incomplete.")

    payload: dict[str, object] = {
        "initial_message": {
            "role": "user",
            "content": [{"type": "text", "text": build_prompt(meta)}],
            "run": True,
        },
        "selected_repository": args.repository,
        "selected_branch": args.branch,
        "git_provider": "github",
        "title": f"GitHub issue #{issue_number}: {issue_title}"[:200],
        "public": False,
    }
    created = api_request("POST", "/api/v1/app-conversations", api_key, payload)
    if not isinstance(created, dict):
        raise SystemExit("OpenHands API returned an unexpected start payload.")

    task_id = str(created.get("id") or "").strip()
    if not task_id:
        raise SystemExit("OpenHands API did not return a start-task id.")

    deadline = time.monotonic() + args.timeout_seconds
    conversation_id = wait_for_start_task(
        api_key,
        task_id,
        deadline=deadline,
        poll_interval_seconds=args.poll_interval_seconds,
    )
    status, conversation_url = wait_for_execution(
        api_key,
        conversation_id,
        deadline=deadline,
        poll_interval_seconds=args.poll_interval_seconds,
    )

    print(f"OpenHands conversation: {conversation_url}")
    write_outputs(
        {
            "conversation_id": conversation_id,
            "status": status.upper(),
            "conversation_url": conversation_url,
        }
    )


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

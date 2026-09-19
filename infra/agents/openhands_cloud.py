#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


TERMINAL_STATUSES = {"STOPPED", "FAILED", "ERROR", "CANCELLED"}
DEFAULT_BASE_URL = "https://app.all-hands.dev"


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

    payload: dict[str, object] = {
        "initial_user_msg": args.prompt,
        "repository": args.repository,
        "selected_branch": args.branch,
    }
    created = api_request(
        "POST",
        "/api/conversations",
        api_key,
        payload,
    )

    conversation_id = str(created.get("conversation_id") or created.get("id") or "").strip()
    if not conversation_id:
        raise SystemExit("OpenHands API did not return a conversation id.")

    status = str(created.get("status") or "UNKNOWN").upper()
    conversation_url = f"{DEFAULT_BASE_URL}/conversations/{conversation_id}"
    deadline = time.monotonic() + args.timeout_seconds

    while status not in TERMINAL_STATUSES and time.monotonic() < deadline:
        time.sleep(args.poll_interval_seconds)
        current = api_request(
            "GET",
            f"/api/conversations/{conversation_id}",
            api_key,
        )
        status = str(current.get("status") or "UNKNOWN").upper()

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
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--branch", required=True)
    parser.add_argument("--timeout-seconds", type=int, default=1200)
    parser.add_argument("--poll-interval-seconds", type=int, default=30)
    args = parser.parse_args()
    run_conversation(args)


if __name__ == "__main__":
    main()

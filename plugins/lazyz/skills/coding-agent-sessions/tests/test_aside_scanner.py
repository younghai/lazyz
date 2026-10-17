#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pytest"]
# ///

# ─── How to run ───
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run directly (no venv, no pip install needed):
#      uv run --with pytest pytest tests/test_aside_scanner.py
# 3. Or make executable and run:
#      chmod +x tests/test_aside_scanner.py && uv run --with pytest pytest tests/test_aside_scanner.py
# ─────────────────

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_ROOT / "scripts"))

from agent_sessions.scanners import PLATFORM_ALIASES, PLATFORM_SCANNERS, scan


def test_scan_aside_when_fixture_has_index_and_transcript(tmp_path: Path) -> None:
    # Given: an Aside export with indexed parent metadata and a transcript.
    user_dir = tmp_path / ".aside" / "u" / "0"
    transcript = user_dir / "sessions" / "20260810_child-123" / "messages.jsonl"
    transcript.parent.mkdir(parents=True)
    events = [
        {"role": "user", "content": "inspect checkout", "timestamp": 1_723_300_000_000},
        {
            "role": "assistant",
            "content": "done",
            "provider": "fallback-provider",
            "model": "fallback-model",
            "usage": {"input": 7, "output": 3},
            "timestamp": 1_723_300_001_000,
        },
        {"role": "user", "content": "show evidence", "timestamp": 1_723_300_002_000},
    ]
    transcript.write_text("".join(f"{json.dumps(event)}\n" for event in events), encoding="utf-8")
    with sqlite3.connect(user_dir / "state.db") as connection:
        connection.execute(
            "create table sessions (id text, parent_id text, title text, cwd text, model text, created_at real, updated_at real)"
        )
        connection.execute(
            "insert into sessions values (?, ?, ?, ?, ?, ?, ?)",
            (
                "child-123",
                "parent-456",
                "Checkout investigator",
                "/workspace/shop",
                json.dumps({"provider": "aside", "modelId": "agent-v2"}),
                1_723_300_000,
                1_723_300_002,
            ),
        )

    # When: the registered scanner scans the exported root.
    sessions = scan(frozenset({"aside-browser"}), (tmp_path,), workers=2)

    # Then: the transcript and state index are joined into one child session.
    assert len(sessions) == 1
    session = sessions[0]
    assert session.platform == "aside"
    assert session.id == "child-123"
    assert session.parent_id == "parent-456"
    assert session.agent == "Checkout investigator"
    assert session.cwd == "/workspace/shop"
    assert session.provider == "aside"
    assert session.model == "agent-v2"
    assert session.first_user_message == "inspect checkout"
    assert session.last_user_message == "show evidence"
    assert session.usage == {"input": 7, "output": 3}


def test_aside_registry_when_platforms_are_inspected() -> None:
    # Given: the machine-consumed scanner registry.
    # When: Aside keys are resolved.
    scanner = PLATFORM_SCANNERS.get("aside")
    alias = PLATFORM_ALIASES.get("aside-browser")

    # Then: both the canonical platform and browser alias are registered.
    assert callable(scanner)
    assert alias == "aside"

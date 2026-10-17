#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pytest"]
# ///

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SKILL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_ROOT / "scripts"))

from agent_sessions.scanners import PLATFORM_SCANNERS, scan


def write_session(root: Path, session_id: str, prompt: str) -> None:
    session = root / "sessions" / "workspace" / f"20260825_{session_id}.jsonl"
    session.parent.mkdir(parents=True)
    events = [
        {"type": "session", "id": session_id, "cwd": "/workspace", "timestamp": "2026-08-25T00:00:00Z"},
        {"type": "message", "message": {"role": "user", "content": prompt}},
    ]
    _ = session.write_text("".join(f"{json.dumps(event)}\n" for event in events), encoding="utf-8")


@pytest.mark.parametrize(
    ("platform", "relative_root"),
    [
        ("senpi", ".omo/agent"),
        ("oh-my-pi", ".omp/agent"),
        ("gajae-code", ".gjc/agent"),
    ],
)
def test_scan_pi_family_when_default_store_exists(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    platform: str,
    relative_root: str,
) -> None:
    # Given: one default pi-family session store under the temporary home.
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("XDG_DATA_HOME", raising=False)
    write_session(tmp_path / relative_root, f"{platform}-123", f"{platform} prompt")

    # When: the canonical platform scanner runs without an explicit root.
    sessions = scan(frozenset({platform}), (), workers=2)

    # Then: the store is registered and the transcript is reconstructed.
    assert platform in PLATFORM_SCANNERS
    assert [(session.platform, session.id, session.first_user_message) for session in sessions] == [
        (platform, f"{platform}-123", f"{platform} prompt")
    ]


def test_scan_senpi_when_omo_profile_store_exists(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given: an OMO profile store used by a non-default Senpi profile.
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("XDG_DATA_HOME", raising=False)
    write_session(tmp_path / ".omo" / "profiles" / "work" / "agent", "profile-123", "profile prompt")

    # When: the Senpi scanner runs.
    sessions = scan(frozenset({"senpi"}), (), workers=2)

    # Then: profile roots are included in the bounded default probe.
    assert [(session.id, session.first_user_message) for session in sessions] == [
        ("profile-123", "profile prompt")
    ]

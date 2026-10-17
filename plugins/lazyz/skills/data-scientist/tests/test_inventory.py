#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pytest"]
# ///

# ─── How to run ───
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run directly (no venv, no pip install needed):
#      uv run --with pytest pytest tests/test_inventory.py
# 3. Or make executable and run:
#      chmod +x tests/test_inventory.py && uv run --with pytest pytest tests/test_inventory.py
# ─────────────────

from __future__ import annotations

import re
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_FILES = frozenset(
    {
        "SKILL.md",
        "agents/openai.yaml",
        "references/common-scenarios.md",
        "references/execution-templates.md",
        "references/integration-patterns.md",
        "references/performance-benchmarks.md",
        "references/uv-setup.md",
        "scripts/quick-query.py",
        "scripts/setup-uv.ps1",
        "scripts/setup-uv.sh",
    }
)


def test_data_scientist_when_skill_inventory_is_inspected() -> None:
    # Given: the required portable data-scientist bundle inventory.
    # When: shipped skill files are resolved from the skill root.
    missing = sorted(path for path in EXPECTED_FILES if not (SKILL_ROOT / path).is_file())

    # Then: every runtime, reference, setup, and agent metadata file is present.
    assert missing == []


def test_data_scientist_when_routing_frontmatter_is_parsed() -> None:
    # Given: the machine-routed SKILL.md frontmatter.
    content = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
    match = re.match(r"^---\n(?P<frontmatter>.*?)\n---", content, flags=re.DOTALL)

    # When: the routing-bearing fields are inspected.
    assert match is not None
    frontmatter = match.group("frontmatter")

    # Then: the canonical skill name and data-analysis trigger are exposed.
    assert re.search(r"^name:\s*data-scientist$", frontmatter, flags=re.MULTILINE)
    assert "analyze the data" in frontmatter

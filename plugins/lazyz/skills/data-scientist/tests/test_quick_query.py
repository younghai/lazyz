#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["duckdb", "polars", "numpy", "pyarrow", "typer", "rich", "pytest"]
# ///

# ─── How to run ───
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run directly (no venv, no pip install needed):
#      uv run --with pytest --with duckdb --with polars --with numpy --with pyarrow --with typer --with rich pytest tests/test_quick_query.py
# 3. Or make executable and run:
#      chmod +x tests/test_quick_query.py && uv run --with pytest --with duckdb --with polars --with numpy --with pyarrow --with typer --with rich pytest tests/test_quick_query.py
# ─────────────────

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "quick-query.py"


def _run_query(data_file: Path, query: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(data_file), query],
        check=False,
        capture_output=True,
        text=True,
    )


def test_sql_alias_when_literal_contains_from_data_is_not_rewritten(tmp_path: Path) -> None:
    # Given: a CSV containing text that resembles a table reference.
    data_file = tmp_path / "orders.csv"
    data_file.write_text('note\n"FROM data "\n', encoding="utf-8")

    # When: a query uses the safe data alias and compares the literal text.
    result = _run_query(data_file, "SELECT note FROM data WHERE note = 'FROM data '")

    # Then: only the parsed table reference is bound; the string literal survives.
    assert result.returncode == 0, result.stderr
    assert "FROM data" in result.stdout
    assert "1 rows" in result.stdout


def test_sql_when_multiple_statements_are_supplied_is_rejected(tmp_path: Path) -> None:
    # Given: a valid selected CSV and a query followed by a mutating statement.
    data_file = tmp_path / "orders.csv"
    data_file.write_text("amount\n10\n", encoding="utf-8")

    # When: the query runner receives more than one SQL statement.
    result = _run_query(data_file, "SELECT * FROM data; DROP TABLE data")

    # Then: the boundary rejects the input before executing either statement.
    assert result.returncode != 0
    assert "exactly one read-only SELECT statement" in result.stderr


def test_sql_when_external_file_function_is_used_is_blocked(tmp_path: Path) -> None:
    # Given: a selected CSV and a query attempting to read a second file.
    data_file = tmp_path / "orders.csv"
    secret_file = tmp_path / "secret.csv"
    data_file.write_text("amount\n10\n", encoding="utf-8")
    secret_file.write_text("secret\nprivate\n", encoding="utf-8")

    # When: SQL attempts external access after the selected file is bound.
    result = _run_query(data_file, f"SELECT * FROM read_csv_auto('{secret_file}')")

    # Then: DuckDB external access is disabled for user SQL.
    assert result.returncode != 0
    assert "external access" in result.stderr.lower()

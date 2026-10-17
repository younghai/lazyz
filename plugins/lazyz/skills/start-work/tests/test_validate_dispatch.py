#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pydantic", "pytest", "typer"]
# ///

# ─── How to run ───
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run directly (no venv, no pip install needed):
#      uv run --with pydantic --with pytest --with typer pytest tests/test_validate_dispatch.py
# 3. Or make executable and run:
#      chmod +x tests/test_validate_dispatch.py && uv run --with pydantic --with pytest --with typer pytest tests/test_validate_dispatch.py
# ─────────────────

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

SKILL_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).parent / "fixtures"
SCRIPT = SKILL_ROOT / "scripts" / "validate_dispatch.py"
REQUIRED_FIELDS = (
    "schemaVersion",
    "workId",
    "taskId",
    "runId",
    "execution_shape",
    "role",
    "phase",
    "criterionRefs",
    "budget",
    "parallel_safe",
    "owned_paths",
    "completion_condition",
    "deliverable",
    "verify",
    "stop_when",
    "artifact",
    "parent_validation",
)


def _load_validator() -> ModuleType:
    spec = importlib.util.spec_from_file_location("validate_dispatch", SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


VALIDATOR = _load_validator()


def test_assignment_when_complete_contract_is_parsed() -> None:
    # Given: a complete dispatch assignment fixture.
    payload = (FIXTURES / "valid-assignment.json").read_text(encoding="utf-8")

    # When: the eval-free boundary parses the assignment.
    assignment = VALIDATOR.parse_assignment(payload)

    # Then: all scheduling and completion fields are preserved as typed values.
    assert assignment.execution_shape == "standard"
    assert assignment.role == "implementer"
    assert assignment.taskId == "task-session-parser"
    assert assignment.criterionRefs == ("G001-first/C001",)
    assert assignment.budget.maxCalls == 4
    assert assignment.parallel_safe is True
    assert assignment.owned_paths == ("src/session_parser.py", "tests/test_session_parser.py")
    assert assignment.completion_condition == (
        "Targeted parser tests exit zero",
        "Evidence artifact exists at the declared path",
    )


@pytest.mark.parametrize("missing_field", REQUIRED_FIELDS)
def test_assignment_when_required_field_is_missing_is_rejected(missing_field: str) -> None:
    # Given: an assignment with one required machine field removed.
    payload = json.loads((FIXTURES / "valid-assignment.json").read_text(encoding="utf-8"))
    del payload[missing_field]

    # When/Then: boundary parsing rejects the incomplete contract.
    with pytest.raises(VALIDATOR.DispatchContractError):
        VALIDATOR.parse_assignment(json.dumps(payload))


def test_assignment_when_parallel_ownership_is_broad_is_rejected() -> None:
    # Given: a parallel assignment claiming the entire workspace.
    payload = json.loads((FIXTURES / "valid-assignment.json").read_text(encoding="utf-8"))
    payload["owned_paths"] = ["**"]

    # When/Then: the scheduler boundary rejects unsafe ownership.
    with pytest.raises(VALIDATOR.DispatchContractError):
        VALIDATOR.parse_assignment(json.dumps(payload))


@pytest.mark.parametrize("completion_condition", ([], [""], ["tests pass", "  "]))
def test_assignment_when_completion_conditions_are_empty_or_blank_are_rejected(
    completion_condition: list[str],
) -> None:
    # Given: an assignment without a usable binary completion condition.
    payload = json.loads((FIXTURES / "valid-assignment.json").read_text(encoding="utf-8"))
    payload["completion_condition"] = completion_condition

    # When/Then: the dispatch boundary rejects the unusable condition list.
    with pytest.raises(VALIDATOR.DispatchContractError):
        VALIDATOR.parse_assignment(json.dumps(payload))


@pytest.mark.parametrize("field", ("execution_shape", "role"))
def test_assignment_when_schema_enum_is_unknown_is_rejected(field: str) -> None:
    # Given: a dispatch assignment with an unsupported scheduling enum.
    payload = json.loads((FIXTURES / "valid-assignment.json").read_text(encoding="utf-8"))
    payload[field] = "unsupported"

    # When/Then: strict schema validation rejects the unknown value.
    with pytest.raises(VALIDATOR.DispatchContractError):
        VALIDATOR.parse_assignment(json.dumps(payload))


def test_assignment_when_code_like_input_is_supplied_is_not_evaluated(tmp_path: Path) -> None:
    # Given: code-shaped text in an enum field and a sentinel path.
    sentinel = tmp_path / "executed"
    payload = json.loads((FIXTURES / "valid-assignment.json").read_text(encoding="utf-8"))
    payload["execution_shape"] = f"__import__('pathlib').Path('{sentinel}').touch()"

    # When: the JSON/Pydantic parser rejects the invalid literal.
    with pytest.raises(VALIDATOR.DispatchContractError):
        VALIDATOR.parse_assignment(json.dumps(payload))

    # Then: no code was executed.
    assert not sentinel.exists()


@pytest.mark.parametrize(
    ("field", "value"),
    (
        ("schemaVersion", 2),
        ("criterionRefs", ["free text"]),
        ("budget", {"maxCalls": 6, "maxSameFailure": 2}),
        ("budget", {"maxCalls": 4, "maxSameFailure": 4}),
    ),
)
def test_assignment_when_executor_contract_exceeds_hard_bounds_is_rejected(
    field: str,
    value: int | list[str] | dict[str, int],
) -> None:
    payload = json.loads((FIXTURES / "valid-assignment.json").read_text(encoding="utf-8"))
    payload[field] = value
    with pytest.raises(VALIDATOR.DispatchContractError):
        VALIDATOR.parse_assignment(json.dumps(payload))


def test_assignment_when_rendered_as_prompt_marker_contains_only_executor_envelope() -> None:
    assignment = VALIDATOR.parse_assignment(
        (FIXTURES / "valid-assignment.json").read_text(encoding="utf-8"),
    )
    marker = VALIDATOR.render_dispatch_marker(assignment)
    prefix, raw = marker.split(": ", maxsplit=1)
    assert prefix == "LAZYCODEX_DISPATCH_V1"
    assert json.loads(raw) == {
        "schemaVersion": 1,
        "workId": "work-session-parser",
        "taskId": "task-session-parser",
        "runId": "run-1",
        "role": "implementer",
        "phase": "execute",
        "criterionRefs": ["G001-first/C001"],
        "budget": {"maxCalls": 4, "maxSameFailure": 2},
    }


def test_cli_when_marker_is_long_keeps_it_on_one_line() -> None:
    assignment = VALIDATOR.parse_assignment(
        (FIXTURES / "valid-assignment.json").read_text(encoding="utf-8"),
    )
    result = subprocess.run(
        [sys.executable, str(SCRIPT), str(FIXTURES / "valid-assignment.json")],
        check=True,
        capture_output=True,
        text=True,
    )
    assert result.stdout.splitlines() == [VALIDATOR.render_dispatch_marker(assignment)]


def test_final_when_deliverable_is_complete_is_accepted() -> None:
    # Given: a complete worker final fixture.
    payload = (FIXTURES / "valid-final.json").read_text(encoding="utf-8")

    # When: the result boundary parses it.
    result = VALIDATOR.parse_final(payload)

    # Then: the completion result is accepted.
    assert result.completion_condition_met is True


def test_final_when_response_is_ack_only_is_rejected() -> None:
    # Given: a worker final containing only an acknowledgement.
    payload = (FIXTURES / "ack-only-final.json").read_text(encoding="utf-8")

    # When/Then: it cannot satisfy the completion contract.
    with pytest.raises(VALIDATOR.DispatchContractError):
        VALIDATOR.parse_final(payload)

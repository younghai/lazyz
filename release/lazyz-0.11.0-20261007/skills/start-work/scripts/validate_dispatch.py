#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pydantic>=2,<3",
#     "typer",
# ]
# ///

# ─── How to run ───
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run directly (no venv, no pip install needed):
#      uv run scripts/validate_dispatch.py assignment.json --final final.json
# 3. Or make executable and run:
#      chmod +x scripts/validate_dispatch.py && ./scripts/validate_dispatch.py assignment.json
# ─────────────────

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Annotated, ClassVar, Literal

import typer
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    TypeAdapter,
    ValidationError,
    field_validator,
    model_validator,
)
from rich import print as rprint

ExecutionShape = Literal["mechanical", "standard", "cohesive-hard"]
Role = Literal["implementer", "reviewer", "qa", "writer"]
Phase = Literal["execute", "verify", "final"]
BROAD_OWNERSHIP = frozenset({"*", "**", ".", "./", "/", "~"})
SAFE_ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$"
CRITERION_REF_PATTERN = r"^(?:[GC][0-9]{3,}|G[0-9]{3,}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?/C[0-9]{3,})$"


class DispatchContractError(Exception):
    reason: str

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


class DispatchValueError(ValueError):
    pass


class DispatchBudget(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid", strict=True)

    maxCalls: int = Field(ge=1, le=5)
    maxSameFailure: int = Field(ge=1, le=3)


class DispatchAssignment(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid", strict=True)

    schemaVersion: Literal[1]
    workId: str = Field(pattern=SAFE_ID_PATTERN)
    taskId: str = Field(pattern=SAFE_ID_PATTERN)
    runId: str = Field(pattern=SAFE_ID_PATTERN)
    execution_shape: ExecutionShape
    role: Role
    phase: Phase
    criterionRefs: tuple[str, ...] = Field(min_length=1)
    budget: DispatchBudget
    parallel_safe: bool
    owned_paths: tuple[str, ...] = Field(min_length=1)
    completion_condition: tuple[str, ...] = Field(min_length=1)
    deliverable: str
    verify: str
    stop_when: str
    artifact: str
    parent_validation: str

    @field_validator(
        "deliverable",
        "verify",
        "stop_when",
        "artifact",
        "parent_validation",
    )
    @classmethod
    def require_content(cls, value: str) -> str:
        if not value.strip():
            raise DispatchValueError("field must contain non-whitespace text")
        return value

    @field_validator("owned_paths")
    @classmethod
    def require_owned_paths(cls, paths: tuple[str, ...]) -> tuple[str, ...]:
        if any(not path.strip() for path in paths):
            raise DispatchValueError("owned paths must contain non-whitespace text")
        return paths

    @field_validator("completion_condition")
    @classmethod
    def require_completion_conditions(cls, conditions: tuple[str, ...]) -> tuple[str, ...]:
        if any(not condition.strip() for condition in conditions):
            raise DispatchValueError("completion conditions must contain non-whitespace text")
        return conditions

    @field_validator("criterionRefs")
    @classmethod
    def require_criterion_refs(cls, refs: tuple[str, ...]) -> tuple[str, ...]:
        if len(set(refs)) != len(refs):
            raise DispatchValueError("criterion refs must be unique")
        if any(re.fullmatch(CRITERION_REF_PATTERN, ref) is None for ref in refs):
            raise DispatchValueError("criterion refs must use canonical G001/C001 form")
        return refs

    @model_validator(mode="after")
    def require_bounded_parallel_ownership(self) -> DispatchAssignment:
        if self.parallel_safe and any(path.strip() in BROAD_OWNERSHIP for path in self.owned_paths):
            raise DispatchValueError("parallel-safe assignments require bounded owned paths")
        return self


class FinalResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid", strict=True)

    deliverable: str
    verify: str
    artifact: str
    completion_condition_met: bool

    @field_validator("deliverable", "verify", "artifact")
    @classmethod
    def require_content(cls, value: str) -> str:
        if not value.strip():
            raise DispatchValueError("field must contain non-whitespace text")
        return value


def parse_assignment(payload: str) -> DispatchAssignment:
    try:
        return DispatchAssignment.model_validate_json(payload)
    except ValidationError as error:
        raise DispatchContractError("invalid dispatch assignment") from error


def parse_final(payload: str) -> FinalResponse:
    try:
        acknowledgement = TypeAdapter(str).validate_json(payload)
    except ValidationError:
        try:
            final = FinalResponse.model_validate_json(payload)
        except ValidationError as error:
            raise DispatchContractError("invalid worker final") from error
    else:
        raise DispatchContractError(f"ack-only worker final is not a deliverable: {acknowledgement}")
    if not final.completion_condition_met:
        raise DispatchContractError("worker final did not meet its completion condition")
    return final


def render_dispatch_marker(assignment: DispatchAssignment) -> str:
    envelope = {
        "schemaVersion": assignment.schemaVersion,
        "workId": assignment.workId,
        "taskId": assignment.taskId,
        "runId": assignment.runId,
        "role": assignment.role,
        "phase": assignment.phase,
        "criterionRefs": assignment.criterionRefs,
        "budget": assignment.budget.model_dump(),
    }
    return f"LAZYCODEX_DISPATCH_V1: {json.dumps(envelope, separators=(',', ':'))}"


def main(
    assignment_file: Annotated[Path, typer.Argument(help="Dispatch assignment JSON file")],
    final_file: Annotated[Path | None, typer.Option("--final", help="Optional worker final JSON file")] = None,
) -> None:
    """Validate a start-work assignment and optional worker final."""
    try:
        assignment = parse_assignment(assignment_file.read_text(encoding="utf-8"))
        final = parse_final(final_file.read_text(encoding="utf-8")) if final_file is not None else None
    except (DispatchContractError, OSError) as error:
        rprint(f"[red]INVALID[/red] {error}")
        raise typer.Exit(2) from error
    typer.echo(render_dispatch_marker(assignment))
    if final is not None:
        typer.echo(final.model_dump_json())


if __name__ == "__main__":
    typer.run(main)

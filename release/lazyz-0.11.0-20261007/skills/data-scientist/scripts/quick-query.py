#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "duckdb",
#     "polars",
#     "numpy",
#     "pyarrow",
#     "typer",
#     "rich",
# ]
# ///

# ─── How to run ───
# 1. Install uv (if not installed):
#      curl -LsSf https://astral.sh/uv/install.sh | sh
# 2. Run directly (no venv, no pip install needed):
#      uv run scripts/quick-query.py data.csv "SELECT * FROM data LIMIT 10"
# 3. Or make executable and run:
#      chmod +x scripts/quick-query.py && ./scripts/quick-query.py data.csv --describe
# ─────────────────

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Annotated

import duckdb
import polars as pl
import typer
from rich import print as rprint
from rich.table import Table


def _run_duckdb(file_path: Path, sql: str) -> None:
    with duckdb.connect() as connection:
        statements = connection.extract_statements(sql)
        if len(statements) != 1 or statements[0].type != duckdb.StatementType.SELECT:
            raise typer.BadParameter("SQL must contain exactly one read-only SELECT statement")

        _duckdb_relation(connection, file_path).create("data")
        aliases = {"df", file_path.stem} - {"data"}
        for alias in aliases:
            quoted = alias.replace('"', '""')
            connection.execute(f'CREATE TEMP VIEW "{quoted}" AS SELECT * FROM data')
        connection.execute("SET enable_external_access=false")
        try:
            result = connection.sql(sql).pl()
        except duckdb.PermissionException as error:
            raise typer.BadParameter("External access is disabled; query only the selected data file") from error
        _print_polars(result)


def _duckdb_relation(connection: duckdb.DuckDBPyConnection, file_path: Path) -> duckdb.DuckDBPyRelation:
    readers: dict[str, Callable[[], duckdb.DuckDBPyRelation]] = {
        ".csv": lambda: connection.read_csv(str(file_path)),
        ".tsv": lambda: connection.read_csv(str(file_path), delimiter="\t"),
        ".parquet": lambda: connection.read_parquet(str(file_path)),
        ".json": lambda: connection.read_json(str(file_path)),
        ".jsonl": lambda: connection.read_json(str(file_path)),
        ".ndjson": lambda: connection.read_json(str(file_path)),
    }
    suffix = file_path.suffix.lower()
    reader = readers.get(suffix)
    if reader is None:
        raise typer.BadParameter(f"Unsupported format: {suffix}; export Excel files to CSV or Parquet")
    return reader()


def _run_polars_filter(file_path: Path, expr: str) -> None:
    _print_polars(_read_file(file_path).filter(pl.sql_expr(expr)))


def _run_describe(file_path: Path) -> None:
    frame = _read_file(file_path)
    rprint(f"\n[bold]Schema:[/bold] {file_path.name} ({len(frame)} rows × {len(frame.columns)} cols)")
    for name, dtype in zip(frame.columns, frame.dtypes, strict=True):
        rprint(f"  {name}: [cyan]{dtype}[/cyan]")
    rprint("\n[bold]Statistics:[/bold]")
    _print_polars(frame.describe())


def _read_file(file_path: Path) -> pl.DataFrame:
    readers: dict[str, Callable[[], pl.DataFrame]] = {
        ".csv": lambda: pl.read_csv(file_path),
        ".tsv": lambda: pl.read_csv(file_path, separator="\t"),
        ".parquet": lambda: pl.read_parquet(file_path),
        ".json": lambda: pl.read_json(file_path),
        ".jsonl": lambda: pl.read_ndjson(file_path),
        ".ndjson": lambda: pl.read_ndjson(file_path),
    }
    suffix = file_path.suffix.lower()
    reader = readers.get(suffix)
    if reader is None:
        raise typer.BadParameter(f"Unsupported format: {suffix}; export Excel files to CSV or Parquet")
    return reader()


def _print_polars(frame: pl.DataFrame) -> None:
    table = Table(show_lines=False)
    for column_name in frame.columns:
        table.add_column(column_name)
    for row in frame.iter_rows():
        table.add_row(*(str(value) for value in row))
    rprint(table)
    rprint(f"[dim]{frame.shape[0]} rows × {frame.shape[1]} cols[/dim]")


def main(
    file: Annotated[Path, typer.Argument(help="Data file (csv, tsv, parquet, json, ndjson)")],
    sql: Annotated[str | None, typer.Argument(help="Read-only SQL query. Use 'data' as the table name.")] = None,
    filter_expr: Annotated[
        str | None,
        typer.Option("--filter", "-f", help="Polars SQL filter, e.g. 'amount > 100'"),
    ] = None,
    describe: Annotated[bool, typer.Option("--describe", "-d", help="Print schema and statistics")] = False,
) -> None:
    """Query a selected data file without exposing arbitrary DuckDB file access."""
    if not file.is_file():
        raise typer.BadParameter(f"File not found: {file}")
    if describe:
        _run_describe(file)
    elif filter_expr is not None:
        _run_polars_filter(file, filter_expr)
    elif sql is not None:
        _run_duckdb(file, sql)
    else:
        _run_describe(file)


if __name__ == "__main__":
    typer.run(main)

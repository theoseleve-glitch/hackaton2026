from pathlib import Path

WORKFLOW = (
    Path(__file__).resolve().parents[2]
    / ".github"
    / "workflows"
    / "schema-sync.yml"
)


def _read() -> str:
    assert WORKFLOW.exists(), f"workflow missing at {WORKFLOW}"
    return WORKFLOW.read_text(encoding="utf-8")


def test_workflow_file_exists() -> None:
    assert WORKFLOW.exists()


def test_workflow_declares_schema_sync_check_job() -> None:
    content = _read()
    # Job id must be `schema-sync-check` per sprint task T052 acceptance.
    assert "schema-sync-check:" in content


def test_workflow_regenerates_all_three_targets() -> None:
    content = _read()
    # The pipeline must touch Python → TS → Swift → Kotlin (all three codegen
    # outputs depend on the Pydantic models staying in sync).
    assert "generate_openapi" in content
    assert "generate:ts" in content
    assert "generate:swift" in content
    assert "generate:kotlin" in content

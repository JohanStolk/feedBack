"""Scan prune guard — background_scan() must refuse to prune when listing returns 0
songs but the songs table is non-empty (feedBack#P1-libpurge).

Failing input:
    - builtin_content seeding mocked (simulates RO mount where writes fail)
    - dlc dir contains no feedpak/sloppak/wem files
    - songs table has 1 row

Without the guard: delete_missing({}) fires, all rows deleted.
With the guard:    scan aborts with stage='error', row survives.
"""
import importlib
import sys
import unittest.mock as mock

import pytest


@pytest.fixture()
def prune_guard_env(tmp_path, monkeypatch, reset_scan_state):
    """Isolated scan env with seeding mocked out, in-process executor, pre-populated DB."""
    import concurrent.futures

    monkeypatch.setenv("CONFIG_DIR", str(tmp_path))
    monkeypatch.delenv("DLC_DIR", raising=False)

    # Empty dlc dir — no feedpak/sloppak/wem files anywhere
    dlc = tmp_path / "dlc"
    dlc.mkdir()
    (tmp_path / "config.json").write_text('{"dlc_dir": "%s"}' % dlc)

    # Mock out builtin seeding so the dlc dir stays empty (simulates a RO FUSE
    # mount where seed writes fail silently and the listing returns nothing).
    monkeypatch.setattr("builtin_content.seed_builtin_diagnostic_sloppaks",
                        lambda *a, **kw: None)
    monkeypatch.setattr("builtin_content.seed_builtin_starter_content",
                        lambda *a, **kw: None)

    sys.modules.pop("server", None)
    mod = importlib.import_module("server")

    import scan as scan_mod
    monkeypatch.setattr(
        scan_mod, "_make_scan_executor",
        lambda: concurrent.futures.ThreadPoolExecutor(max_workers=1),
    )

    yield mod, scan_mod

    conn = getattr(getattr(mod, "meta_db", None), "conn", None)
    if conn is not None:
        getattr(sys.modules.get("server"), "_join_background_db_threads", lambda: None)()
        conn.close()


def test_empty_listing_refuses_prune_when_db_nonempty(prune_guard_env):
    """background_scan() with 0 discovered songs + 1 DB row → stage=error, row survives.

    Failing input: dlc dir empty (no feedpak/sloppak/wem), songs table has 1 row.
    Expected:      row count unchanged, scan_status['stage'] == 'error'.
    """
    mod, scan_mod = prune_guard_env
    import appstate

    # Pre-populate the songs table with one row
    appstate.meta_db.put(
        "song_that_must_survive.feedpak", 12345.0, 1000,
        {"title": "Survivor", "artist": "Test", "album": "", "duration": 1.0,
         "tuning": "", "arrangements": [], "format": "archive"},
    )
    count_before = appstate.meta_db.conn.execute(
        "SELECT COUNT(*) FROM songs").fetchone()[0]
    assert count_before == 1, f"pre-condition: 1 row in DB, got {count_before}"

    # Run scan — dlc dir is empty, seeding mocked → listing finds 0 songs
    scan_mod.background_scan()

    count_after = appstate.meta_db.conn.execute(
        "SELECT COUNT(*) FROM songs").fetchone()[0]

    assert count_after == count_before, (
        f"prune guard must refuse delete_missing when listing returns 0 songs; "
        f"DB had {count_before} row(s), now has {count_after}"
    )
    assert scan_mod._scan_status["stage"] == "error", (
        f"scan must set stage='error' when the guard fires, "
        f"got {scan_mod._scan_status['stage']!r}"
    )
    assert scan_mod._scan_status["error"] is not None, "error message must be set"

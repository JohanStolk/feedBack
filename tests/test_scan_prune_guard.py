"""Scan prune guard — background_scan() must refuse to prune when the listing looks
degraded (feedBack#P1-libpurge).

Three cases:

Case A — zero listing (original guard):
    Failing input: dlc dir completely empty, songs table has 1 row.
    Without guard: delete_missing({}) fires → all rows deleted.
    With guard:    scan aborts with stage='error', row survives.

Case B — partial listing (Creed r1 HIGH):
    Failing input: DB has 2 rows, dlc dir shows only 1 file (neither DB row visible).
    Without guard: delete_missing prunes both invisible rows → catastrophic loss.
    With guard:    would_remove(2) >= threshold(1) → stage='error', both rows survive.

Case C — full rescan bypass:
    Same partial-degraded setup, but scan.kick_scan(allow_mass_prune=True).
    Guard logs a warning and proceeds; delete_missing runs normally.
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


# ── Case B: partial listing (Creed r1 HIGH) ───────────────────────────────────

@pytest.fixture()
def partial_prune_env(tmp_path, monkeypatch, reset_scan_state):
    """DB has 2 rows (neither on disk), dlc dir shows 1 unrelated visible file."""
    import concurrent.futures

    monkeypatch.setenv("CONFIG_DIR", str(tmp_path))
    monkeypatch.delenv("DLC_DIR", raising=False)

    dlc = tmp_path / "dlc"
    dlc.mkdir()
    (tmp_path / "config.json").write_text('{"dlc_dir": "%s"}' % dlc)

    # One visible .feedpak file on disk — makes current_files non-empty so the
    # old zero-listing guard would not fire, but both DB rows are absent.
    import zipfile
    visible = dlc / "only-visible.feedpak"
    with zipfile.ZipFile(visible, "w") as zf:
        zf.writestr("manifest.yaml", "title: Visible\nartist: Test\n")

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


def test_partial_listing_refuses_prune_when_mass_threshold_exceeded(partial_prune_env):
    """Creed r1 HIGH: 2 DB rows absent from listing, 1 visible file → auto scan refused.

    Failing input:
        - DB: lost-one.feedpak, lost-two.feedpak (neither on disk)
        - dlc dir: only-visible.feedpak (not in DB)
        - Auto scan (allow_mass_prune=False)
    Expected:
        - Both DB rows survive (count unchanged)
        - stage='error', error message set
    Fails on f6e9727 (old zero-only guard): would_remove=2, current_files non-empty
    → old guard skips → delete_missing prunes both rows.
    """
    mod, scan_mod = partial_prune_env
    import appstate

    _song_meta = {"title": "T", "artist": "A", "album": "", "duration": 1.0,
                  "tuning": "", "arrangements": [], "format": "archive"}
    appstate.meta_db.put("lost-one.feedpak", 11111.0, 500, _song_meta)
    appstate.meta_db.put("lost-two.feedpak", 22222.0, 500, _song_meta)

    count_before = appstate.meta_db.conn.execute(
        "SELECT COUNT(*) FROM songs").fetchone()[0]
    assert count_before == 2, f"pre-condition: 2 rows in DB, got {count_before}"

    # Auto scan — allow_mass_prune stays False (default)
    scan_mod.background_scan()

    count_after = appstate.meta_db.conn.execute(
        "SELECT COUNT(*) FROM songs").fetchone()[0]
    assert count_after == count_before, (
        f"mass-prune guard must refuse when would_remove={count_before - count_after} "
        f"exceeds threshold; DB had {count_before} row(s), now has {count_after}"
    )
    assert scan_mod._scan_status["stage"] == "error", (
        f"scan must set stage='error' when the guard fires, "
        f"got {scan_mod._scan_status['stage']!r}"
    )
    assert scan_mod._scan_status["error"] is not None, "error message must be set"


# ── Case C: full rescan bypasses the guard ────────────────────────────────────

def test_full_rescan_allows_prune_past_threshold(partial_prune_env):
    """Full rescan (allow_mass_prune=True) proceeds even when would_remove >= threshold.

    Same partial-degraded setup as Case B, but the user explicitly invoked
    /api/rescan/full which sets allow_mass_prune=True. The guard logs a warning
    and does not abort; delete_missing runs and prunes the absent rows.

    Failing input: same as Case B.
    Expected:      both absent rows pruned, stage='complete' (or 'scanning').
    """
    mod, scan_mod = partial_prune_env
    import appstate

    _song_meta = {"title": "T", "artist": "A", "album": "", "duration": 1.0,
                  "tuning": "", "arrangements": [], "format": "archive"}
    appstate.meta_db.put("lost-one.feedpak", 11111.0, 500, _song_meta)
    appstate.meta_db.put("lost-two.feedpak", 22222.0, 500, _song_meta)

    count_before = appstate.meta_db.conn.execute(
        "SELECT COUNT(*) FROM songs").fetchone()[0]
    assert count_before == 2

    # Full rescan — allow_mass_prune=True (user-authorised)
    scan_mod.background_scan(allow_mass_prune=True)

    count_after = appstate.meta_db.conn.execute(
        "SELECT COUNT(*) FROM songs").fetchone()[0]
    # The two absent rows are pruned; only-visible may or may not have been indexed
    # (it has a minimal manifest so sloppak detection may skip it — that's fine,
    # the key invariant is that the guard did NOT abort).
    assert scan_mod._scan_status["stage"] != "error", (
        f"full rescan must not abort on mass-prune threshold; "
        f"got stage={scan_mod._scan_status['stage']!r}"
    )
    assert count_after < count_before, (
        f"full rescan must have pruned the absent rows; "
        f"DB had {count_before} row(s), now has {count_after}"
    )

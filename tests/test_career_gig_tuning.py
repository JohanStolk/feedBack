"""Tests for career gig tuning preference filtering (feedBack career-gig-tuning)."""
import importlib
import sys
import types
import pytest


# ---------------------------------------------------------------------------
# Helpers to import the career routes module in isolation
# ---------------------------------------------------------------------------

def _load_routes():
    """Import plugins/career/routes.py with minimal stubs for non-fastapi deps."""
    import importlib.util, pathlib

    path = pathlib.Path(__file__).parent.parent / "plugins" / "career" / "routes.py"
    spec = importlib.util.spec_from_file_location("career_routes_test", path)
    mod = importlib.util.module_from_spec(spec)
    # Stub out lib.* deps only — fastapi IS installed and must not be stubbed
    lib_stubs = ["lib.song", "lib.audio", "lib.sloppak"]
    for s in lib_stubs:
        if s not in sys.modules:
            sys.modules[s] = types.ModuleType(s)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="module")
def career():
    return _load_routes()


# ---------------------------------------------------------------------------
# _tuning_ok_fn — classification logic
# ---------------------------------------------------------------------------

class TestTuningOkFn:
    def test_any_returns_none(self, career):
        assert career._tuning_ok_fn("any") is None

    def test_empty_returns_none(self, career):
        assert career._tuning_ok_fn("") is None

    def test_unknown_returns_none(self, career):
        assert career._tuning_ok_fn("bogus") is None

    def test_standard_matches_e_standard(self, career):
        fn = career._tuning_ok_fn("standard")
        assert fn("E Standard") is True

    def test_standard_matches_eb_standard(self, career):
        fn = career._tuning_ok_fn("standard")
        assert fn("Eb Standard") is True

    def test_standard_rejects_drop_d(self, career):
        fn = career._tuning_ok_fn("standard")
        assert not fn("Drop D")

    def test_standard_rejects_empty(self, career):
        fn = career._tuning_ok_fn("standard")
        assert not fn("")

    def test_drop_matches_drop_d(self, career):
        fn = career._tuning_ok_fn("drop")
        assert fn("Drop D") is True

    def test_drop_matches_double_drop_d(self, career):
        fn = career._tuning_ok_fn("drop")
        assert fn("Double Drop D") is True

    def test_drop_rejects_e_standard(self, career):
        fn = career._tuning_ok_fn("drop")
        assert not fn("E Standard")

    def test_drop_rejects_empty(self, career):
        fn = career._tuning_ok_fn("drop")
        assert not fn("")

    def test_specific_exact_match(self, career):
        fn = career._tuning_ok_fn("specific:Open G")
        assert fn("Open G") is True
        assert not fn("Open A")

    def test_specific_empty_value_returns_none(self, career):
        # "specific:" with no value is degenerate — treated as any (None)
        assert career._tuning_ok_fn("specific:") is None

    def test_specific_too_long_returns_none(self, career):
        assert career._tuning_ok_fn("specific:" + "x" * 65) is None


# ---------------------------------------------------------------------------
# _fill_genre_songs — tuning filter forwarded correctly
# ---------------------------------------------------------------------------

class TestFillGenreSongs:
    """Smoke-test that _fill_genre_songs respects tuning_ok."""

    def _patch_db(self, career, rows):
        fake_db = types.SimpleNamespace(
            conn=types.SimpleNamespace(execute=lambda q: types.SimpleNamespace(fetchall=lambda: rows))
        )
        career._state["meta_db"] = fake_db

    def test_no_filter_returns_all(self, career):
        rows = [
            ("a.sloppak", "Song A", "Artist", "rock", "E Standard"),
            ("b.sloppak", "Song B", "Artist", "rock", "Drop D"),
        ]
        self._patch_db(career, rows)
        result = career._fill_genre_songs("rock", set(), 10, tuning_ok=None)
        assert len(result) == 2

    def test_standard_filter_excludes_drop(self, career):
        rows = [
            ("a.sloppak", "Song A", "Artist", "rock", "E Standard"),
            ("b.sloppak", "Song B", "Artist", "rock", "Drop D"),
        ]
        self._patch_db(career, rows)
        fn = career._tuning_ok_fn("standard")
        result = career._fill_genre_songs("rock", set(), 10, tuning_ok=fn)
        assert len(result) == 1
        assert result[0]["filename"] == "a.sloppak"

    def test_empty_result_when_no_match(self, career):
        rows = [("a.sloppak", "Song A", "Artist", "rock", "Drop D")]
        self._patch_db(career, rows)
        fn = career._tuning_ok_fn("standard")
        result = career._fill_genre_songs("rock", set(), 10, tuning_ok=fn)
        assert result == []

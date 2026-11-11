"""Computed difficulty scores break ties inside the 1–5 difficulty sort."""

import importlib
import sys

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def server(tmp_path, monkeypatch, isolate_logging):
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path))
    monkeypatch.setenv("FEEDBACK_SKIP_STARTUP_TASKS", "1")
    sys.modules.pop("server", None)
    srv = importlib.import_module("server")
    try:
        yield srv
    finally:
        conn = getattr(getattr(srv, "meta_db", None), "conn", None)
        if conn is not None:
            getattr(sys.modules.get("server"), "_join_background_db_threads", lambda: None)()
            conn.close()
        sys.modules.pop("server", None)


@pytest.fixture()
def client(server):
    return TestClient(server.app)


def _songs(client, sort):
    return [s["filename"] for s in client.get(f"/api/library?sort={sort}&size=20").json()["songs"]]


def test_score_orders_songs_within_a_rating(client, server):
    # "AC" sorts first A–Z but is the hardest of the rating-1 songs.
    for fn, artist in (("ac.archive", "AC"), ("lp.archive", "LP"), ("mid.archive", "M"),
                       ("two.archive", "B"), ("none.archive", "Z")):
        server.meta_db.put(fn, 0, 0, {"title": fn, "artist": artist})
    client.post("/api/songs/user-meta/batch",
                json={"filenames": ["ac.archive", "lp.archive", "mid.archive"], "set_difficulty": 1})
    client.post("/api/songs/user-meta/batch", json={"filenames": ["two.archive"], "set_difficulty": 2})
    r = client.post("/api/songs/difficulty-scores",
                    json={"scores": {"ac.archive": 3.0, "lp.archive": 0.6, "mid.archive": 1.5,
                                     "two.archive": 0.1}})
    assert r.json() == {"updated": 4}
    # The rating still decides the group (two: rating 2, though its score is lowest).
    assert _songs(client, "difficulty") == ["lp.archive", "mid.archive", "ac.archive",
                                             "two.archive", "none.archive"]
    assert _songs(client, "difficulty-desc") == ["two.archive", "ac.archive", "mid.archive",
                                                  "lp.archive", "none.archive"]


def test_null_removes_a_score_and_bad_input_is_rejected(client, server):
    server.meta_db.put("a.archive", 0, 0, {"title": "a", "artist": "A"})
    client.post("/api/songs/difficulty-scores", json={"scores": {"a.archive": 2}})
    client.post("/api/songs/difficulty-scores", json={"scores": {"a.archive": None}})
    assert server.meta_db.conn.execute("SELECT COUNT(*) FROM song_difficulty_score").fetchone()[0] == 0
    for bad in ({"scores": [1]}, {"scores": {"a.archive": "x"}}, {"scores": {"a.archive": True}}, {}):
        assert client.post("/api/songs/difficulty-scores", json=bad).status_code == 400

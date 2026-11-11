"""Personal 1–5 star rating (how much you like a song): API, library payload,
sort and the "N stars or more" filter. Separate from the 1–5 difficulty and
from the ♥ favourite."""

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


def _seed(server, *filenames):
    for fn in filenames:
        server.meta_db.put(fn, 0, 0, {"title": fn.split(".")[0], "artist": "A"})


def test_set_read_and_clear(client, server):
    _seed(server, "a.archive")
    assert client.get("/api/song/a.archive/rating").json() == {"rating": None}
    assert client.put("/api/song/a.archive/rating", json={"rating": 4}).json() == {"rating": 4}
    assert client.get("/api/song/a.archive/rating").json() == {"rating": 4}
    assert client.put("/api/song/a.archive/rating", json={"rating": None}).json() == {"rating": None}
    assert client.put("/api/song/a.archive/rating", json={"rating": 2}).json() == {"rating": 2}
    assert client.put("/api/song/a.archive/rating", json={"rating": 0}).json() == {"rating": None}


@pytest.mark.parametrize("bad", [6, -1, 2.5, True, "4", [4]])
def test_rejects_bad_values(client, server, bad):
    _seed(server, "a.archive")
    assert client.put("/api/song/a.archive/rating", json={"rating": bad}).status_code == 400
    assert client.put("/api/song/a.archive/rating", json={}).status_code == 400


def test_independent_of_difficulty_and_favourite(client, server):
    _seed(server, "a.archive")
    client.put("/api/song/a.archive/user-meta", json={"user_difficulty": 2})
    client.put("/api/song/a.archive/rating", json={"rating": 5})
    client.put("/api/song/a.archive/user-meta", json={"user_difficulty": None})
    assert client.get("/api/song/a.archive/rating").json() == {"rating": 5}
    assert not server.meta_db.is_favorite("a.archive")


def test_library_rows_sort_and_filter(client, server):
    _seed(server, "low.archive", "top.archive", "mid.archive", "none.archive")
    for fn, r in (("low.archive", 1), ("top.archive", 5), ("mid.archive", 4)):
        client.put(f"/api/song/{fn}/rating", json={"rating": r})
    songs = client.get("/api/library?sort=rating&size=10").json()["songs"]
    assert [s["filename"] for s in songs] == ["top.archive", "mid.archive", "low.archive", "none.archive"]
    assert {s["filename"]: s["user_rating"] for s in songs}["none.archive"] is None
    got = {s["filename"] for s in client.get("/api/library?rating_min=4").json()["songs"]}
    assert got == {"top.archive", "mid.archive"}
    # Out-of-range filter values are ignored, not an error.
    assert len(client.get("/api/library?rating_min=9").json()["songs"]) == 4


def test_tree_rows_carry_the_rating(client, server):
    _seed(server, "a.archive")
    client.put("/api/song/a.archive/rating", json={"rating": 3})
    artists = client.get("/api/library/artists?size=10").json()["artists"]
    song = artists[0]["albums"][0]["songs"][0]
    assert song["user_rating"] == 3


def test_deleting_a_song_drops_its_rating(server):
    _seed(server, "a.archive")
    server.meta_db.set_song_rating("a.archive", 5)
    with server.meta_db._lock:
        server.meta_db.purge_song_user_data("a.archive")
        server.meta_db.conn.commit()
    assert server.meta_db.get_song_rating("a.archive") is None

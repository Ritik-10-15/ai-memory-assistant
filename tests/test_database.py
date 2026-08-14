"""Database layer tests — schema and CRUD, now testing database.py directly."""
import database


def test_init_db_creates_all_tables(temp_db):
    with database.get_db() as c:
        tables = {
            row["name"]
            for row in c.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
    assert {"people", "visits", "memories", "alerts"} <= tables


def test_add_and_read_person(temp_db):
    with database.get_db() as c:
        c.execute(
            "INSERT INTO people (id,name,relationship) VALUES (?,?,?)",
            ("p1", "Ritik Gupta", "Son"),
        )
    with database.get_db() as c:
        row = c.execute("SELECT * FROM people WHERE id=?", ("p1",)).fetchone()
    assert row["name"] == "Ritik Gupta"
    assert row["relationship"] == "Son"


def test_memory_links_to_person_via_person_id(sample_person):
    with database.get_db() as c:
        c.execute(
            "INSERT INTO memories (person_id,summary,source) VALUES (?,?,?)",
            (sample_person, "Talked about the garden", "manual"),
        )
    with database.get_db() as c:
        rows = c.execute(
            "SELECT * FROM memories WHERE person_id=?", (sample_person,)
        ).fetchall()
    assert len(rows) == 1
    assert rows[0]["summary"] == "Talked about the garden"


def test_memories_ordered_most_recent_first(sample_person):
    with database.get_db() as c:
        c.execute(
            "INSERT INTO memories (person_id,summary,created_at) "
            "VALUES (?,?,'2026-01-01 10:00:00')",
            (sample_person, "older memory"),
        )
        c.execute(
            "INSERT INTO memories (person_id,summary,created_at) "
            "VALUES (?,?,'2026-06-01 10:00:00')",
            (sample_person, "newer memory"),
        )
    with database.get_db() as c:
        rows = c.execute(
            "SELECT summary FROM memories WHERE person_id=? "
            "ORDER BY created_at DESC",
            (sample_person,),
        ).fetchall()
    assert rows[0]["summary"] == "newer memory"
    assert rows[1]["summary"] == "older memory"


def test_deleting_a_memory_removes_only_that_row(sample_person):
    with database.get_db() as c:
        c.execute(
            "INSERT INTO memories (person_id,summary) VALUES (?,?)",
            (sample_person, "keep me"),
        )
        cur = c.execute(
            "INSERT INTO memories (person_id,summary) VALUES (?,?)",
            (sample_person, "delete me"),
        )
        delete_id = cur.lastrowid

    with database.get_db() as c:
        c.execute("DELETE FROM memories WHERE id=?", (delete_id,))

    with database.get_db() as c:
        rows = c.execute(
            "SELECT summary FROM memories WHERE person_id=?", (sample_person,)
        ).fetchall()
    remaining = {r["summary"] for r in rows}
    assert remaining == {"keep me"}
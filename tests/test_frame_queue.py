"""
The frame buffer between the camera (producer) and the recognition worker
(consumer). Phase 8: when the worker falls behind, it must move on to the
newest frame, never recognise one that is already out of date.
"""
import threading

import config
import worker


def test_a_full_buffer_keeps_the_newest_frame():
    q = worker.LatestFrames(maxsize=1)
    for i in range(5):
        q.put_nowait(i)
    assert q.qsize() == 1
    assert q.get_nowait() == 4


def test_a_larger_buffer_drops_the_oldest_and_keeps_order():
    q = worker.LatestFrames(maxsize=2)
    for i in range(5):
        q.put_nowait(i)
    assert [q.get_nowait(), q.get_nowait()] == [3, 4]


def test_the_worker_buffer_holds_only_the_newest_frame():
    assert isinstance(worker.frame_q, worker.LatestFrames)
    assert config.FRAME_QUEUE_SIZE == 1


def test_many_producer_threads_never_overfill_or_lose_the_newest():
    """gunicorn serves /api/frame on several threads at once."""
    q = worker.LatestFrames(maxsize=1)
    sizes = []

    def produce(tid):
        for i in range(2000):
            q.put_nowait((tid, i))
            sizes.append(q.qsize())

    threads = [threading.Thread(target=produce, args=(t,)) for t in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert max(sizes) == 1
    tid, i = q.get_nowait()
    assert i == 1999                      # the last frame some thread offered
    assert q.empty()


def test_a_waiting_worker_wakes_for_a_new_frame():
    q = worker.LatestFrames(maxsize=1)
    got = []
    t = threading.Thread(target=lambda: got.append(q.get(timeout=5)))
    t.start()
    q.put_nowait("frame")
    t.join(timeout=5)
    assert got == ["frame"]

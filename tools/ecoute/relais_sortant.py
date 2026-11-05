"""Publication non bloquante : 64 messages, états fusionnés, aucun historique hors ligne."""
import asyncio
from collections import deque
import threading
import time


class RelayOutbox:
    def __init__(self, loop, maxsize=64, max_age=5):
        self.loop, self.maxsize, self.max_age = loop, maxsize, max_age
        self._items = deque(maxlen=maxsize)
        self._lock = threading.Lock()
        self._event = asyncio.Event()
        self._connected = False
        self._scheduled = False

    def set_connected(self, connected):
        # Une nouvelle connexion commence toujours au direct.
        with self._lock:
            self._connected = connected
            self._items.clear()

    def put_nowait(self, message):
        with self._lock:
            if not self._connected or self.loop.is_closed():
                return
            if message.get('type') == 'caption_engine':
                self._items = deque(((born, msg) for born, msg in self._items
                    if msg.get('type') != 'caption_engine'), maxlen=self.maxsize)
            self._items.append((time.monotonic(), message))
            if self._scheduled:
                return
            self._scheduled = True
        # Une seule notification planifiée, même si un producteur publie en rafale.
        try:
            self.loop.call_soon_threadsafe(self._notify)
        except RuntimeError:
            with self._lock:
                self._scheduled = False
                self._connected = False
                self._items.clear()

    def _notify(self):
        with self._lock:
            self._scheduled = False
        self._event.set()

    def _pop(self):
        now = time.monotonic()
        while self._items:
            born, message = self._items.popleft()
            if now - born <= self.max_age:
                return message
        raise asyncio.QueueEmpty

    def get_nowait(self):
        with self._lock:
            return self._pop()

    async def get(self):
        while True:
            with self._lock:
                try:
                    return self._pop()
                except asyncio.QueueEmpty:
                    self._event.clear()
            await self._event.wait()

    def qsize(self):
        with self._lock:
            return len(self._items)

    def empty(self):
        return self.qsize() == 0

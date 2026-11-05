"""Un seul fil matériel, attentes bornées ; aucune serrure du moteur partagée.

Un pilote natif ne peut pas être tué proprement par Python. S'il se fige, la
voix est verrouillée pour le reste du processus : aucun nouvel écrivain ni
repli ne part en parallèle. Son fil daemon ferme le flux s'il finit par revenir.
"""
import queue
import threading


class AudioStalled(RuntimeError):
    pass


class SerialAudio:
    def __init__(self, timeout=1.5):
        self.timeout = timeout
        self.failed = threading.Event()
        self.jobs = queue.Queue(maxsize=1)
        self.current = None
        self.thread = threading.Thread(target=self._run, name='ecoute-sortie', daemon=True)
        self.thread.start()

    def _run(self):
        while True:
            try:
                job = self.jobs.get(timeout=.2)
            except queue.Empty:
                if self.failed.is_set():
                    if self.current is not None:
                        try:
                            self.current.__exit__(AudioStalled, None, None)
                        except Exception:
                            pass
                    return
                continue
            if job is None:
                return
            fn, done, result = job
            try:
                result.append((True, fn()))
            except Exception as exc:
                result.append((False, exc))
            finally:
                done.set()
            if self.failed.is_set():
                # Si le pilote revient après le délai, arrêter avant tout autre son.
                if self.current is not None:
                    try:
                        self.current.__exit__(AudioStalled, None, None)
                    except Exception:
                        pass
                    self.current = None
                return

    def call(self, fn):
        if self.failed.is_set():
            raise AudioStalled('Pilote audio bloqué : redémarrez le service avant de réactiver la voix.')
        done, result = threading.Event(), []
        self.jobs.put_nowait((fn, done, result))
        if not done.wait(self.timeout):
            self.failed.set()
            raise AudioStalled('Pilote audio bloqué : voix coupée, sous-titres maintenus. Redémarrez le service.')
        ok, value = result[0]
        if not ok:
            raise value
        return value

    def open(self, factory):
        def enter():
            self.current = factory()
            self.current.__enter__()
            return self.current
        return self.call(enter)

    def exit(self, typ, value=None, tb=None):
        if self.failed.is_set():
            return
        def close():
            current, self.current = self.current, None
            if current is not None:
                current.__exit__(typ, value, tb)
        self.call(close)

    def close(self):
        if not self.failed.is_set():
            self.exit(None)
            self.jobs.put_nowait(None)
        self.thread.join(timeout=.2)

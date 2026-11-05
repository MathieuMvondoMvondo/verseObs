"""Régressions des deux points importants de la relecture finale Astra/Sol."""
import asyncio
import contextlib
import json
from pathlib import Path
import sys
import threading
import time

import pytest
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools/ecoute'))
import ecoute
import voix
from test_voix import LocalFaux, attendre


def test_longue_coupure_relais_sans_accumulation():
    async def scenario():
        s=ecoute.Service(ecoute.parse(['--sans-relais','--sans-versets']))
        s.load=lambda:None
        s.proc=None
        task=asyncio.create_task(s.main())
        await asyncio.sleep(0)
        try:
            s.relay_health(False)
            for i in range(2000):s.changed()
            await asyncio.sleep(0)
            assert s.outbox.maxsize==64
            assert s.outbox.qsize()==0
            s.relay_health(True)
            for i in range(2000):
                s.send({'type':'caption_engine','seq':i})
                s.send({'type':'caption','caption':{'en':f'live {i}'}})
            await asyncio.sleep(0)
            assert s.outbox.qsize()<=64
            rows=[]
            while not s.outbox.empty():rows.append(s.outbox.get_nowait())
            assert [r['seq'] for r in rows if r['type']=='caption_engine']==[1999]
            assert rows[-1]['caption']['en']=='live 1999'
            s.send({'type':'caption','caption':{'en':'stale'}})
            s.relay_health(False)
            s.relay_health(True)
            await asyncio.sleep(0)
            assert s.outbox.empty()
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):await task
    asyncio.run(scenario())


def test_file_bornee_depuis_thread_et_legendes_expirees(monkeypatch):
    import relais_sortant
    async def scenario():
        box=relais_sortant.RelayOutbox(asyncio.get_running_loop())
        box.set_connected(True)
        def publish():
            for i in range(2000):box.put_nowait({'type':'caption','i':i})
        t=threading.Thread(target=publish);t.start();t.join(2)
        assert not t.is_alive()
        assert box.qsize()==64
        assert box.get_nowait()['i']==1936
        clock=[time.monotonic()]
        monkeypatch.setattr(relais_sortant.time,'monotonic',lambda:clock[0])
        clock[0]+=6
        with pytest.raises(asyncio.QueueEmpty):box.get_nowait()
        box.put_nowait({'type':'caption','i':'fresh'})
        assert (await box.get())['i']=='fresh'
    asyncio.run(scenario())


def test_texte_expire_pendant_ouverture_jamais_admis():
    writes=[]
    class SlowOpen:
        latency=0
        def __init__(self,*args):pass
        def __enter__(self):time.sleep(.25);return self
        def write(self,*args):writes.append(time.monotonic())
        def __exit__(self,*args):pass
    voice=voix.VoiceEngine(LocalFaux(),outputs=[{'index':7}],sink_factory=SlowOpen)
    try:
        voice.configure(output=7,enabled=True)
        with voice._cv:
            voice._queue.append((time.monotonic()-7.9,'Expired at hardware admission.',voice._generation))
            voice._cv.notify_all()
        attendre(voice.idle)
        assert writes==[]
        assert voice.skipped==1
        assert 'direct' in voice.notice.lower()
    finally:voice.close()


def test_reconnexion_reelle_sans_rafale_perimee():
    from websockets.asyncio.server import serve
    async def scenario():
        connected=asyncio.Event();second=asyncio.Event();received=[];count=0
        async def handler(ws):
            nonlocal count
            count+=1
            initial=json.loads(await ws.recv())
            assert initial['type']=='caption_engine'
            if count==1:
                connected.set()
                await ws.close()
                return
            second.set()
            try:
                while True:received.append(json.loads(await ws.recv()))
            except Exception:pass
        async with serve(handler,'127.0.0.1',0) as server:
            port=server.sockets[0].getsockname()[1]
            s=ecoute.Service(ecoute.parse(['--sans-versets','--relais',f'ws://127.0.0.1:{port}/verseobs-relay']))
            s.load=lambda:None;s.proc=None
            task=asyncio.create_task(s.main())
            try:
                await asyncio.wait_for(connected.wait(),3)
                for _ in range(100):
                    if s._relay_lost_at is not None:break
                    await asyncio.sleep(.01)
                assert s._relay_lost_at is not None
                for i in range(2000):s.send({'type':'caption','caption':{'en':f'stale {i}'}})
                await asyncio.sleep(0)
                assert s.outbox.qsize()==0
                await asyncio.wait_for(second.wait(),5)
                s.send({'type':'caption','caption':{'en':'fresh'}})
                for _ in range(100):
                    if any(m.get('type')=='caption' for m in received):break
                    await asyncio.sleep(.01)
                assert [m['caption']['en'] for m in received if m.get('type')=='caption']==['fresh']
            finally:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):await task
    asyncio.run(scenario())

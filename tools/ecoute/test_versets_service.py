"""Service complet → HTTP local simulé → vrai index → vrai relais.

Aucun modèle téléchargé, aucune API distante, aucune clé réelle : seul le VAD
et les replis locaux sont simulés. Le fichier WAV est synthétique et ne mesure
ni la qualité ASR ni la latence du microphone de la régie.
"""
import asyncio
import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
import wave
from unittest import mock

sys.path.insert(0,str(Path(__file__).parent))
import ecoute
import moteur
from test_api import FakeApi, FakeLocalAsr, FakeLocalMt, gpt_ok

ROOT=Path(__file__).resolve().parents[2]


class HeardServiceWireTest(unittest.TestCase):
    def test_real_service_publishes_before_translation_and_clears_on_stop(self):
        api=FakeApi()
        translation=gpt_ok('For God so loved the world.')
        api.plan=[(200,{'text':'Jean 3 verset 16'},0),(*translation[:2],1.0)]*5
        server=subprocess.Popen(['node','-e',"const {createServer}=require('./tools/server');const s=createServer(18771);s.listen(18771,'127.0.0.1',()=>console.log('READY'));"],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.assertEqual(server.stdout.readline().strip(),'READY')
        logs=io.StringIO()
        try:
            with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(logs):
                audio=Path(tmp)/'synthese.wav';journal=Path(tmp)/'journal.jsonl'
                with wave.open(str(audio),'wb') as wav:
                    wav.setparams((1,2,moteur.SR,0,'NONE','not compressed'))
                    wav.writeframes(b'\0\0'*(moteur.SR*6))
                env={v:'' for v in moteur.KEY_ENV.values()}
                env['VERSEOBS_ECOUTE_API_CLE']=''
                env['VERSEOBS_ECOUTE_OPENAI_CLE']='FIXTURE_NON_SECRETE'
                with mock.patch.dict(os.environ,env), \
                     mock.patch.object(moteur,'Transcriber',FakeLocalAsr), \
                     mock.patch.object(moteur,'Translator',FakeLocalMt), \
                     mock.patch.object(moteur,'silero_vad',lambda:lambda samples:[(0,len(samples))]), \
                     mock.patch.object(ecoute,'translator_dir',lambda _:tmp):
                    args=ecoute.parse(['--relais','ws://127.0.0.1:18771/verseobs-relay','--fichier',str(audio),
                                      '--journal',str(journal),'--max-phrase','1.2',
                                      '--url-openai',api.base+'/v1/audio/transcriptions',
                                      '--url-openai-traduction',api.base+'/v1/chat/completions'])
                    service=ecoute.Service(args)
                    try:
                        asyncio.run(self.exercise(service))
                    except Exception:
                        print(json.dumps({'log':logs.getvalue().replace('FIXTURE_NON_SECRETE','[masqué]'),'requêtes':[r['path'] for r in api.requests],'état':service.state()},ensure_ascii=False),file=sys.__stderr__)
                        raise
                    finally:
                        if service.journal:service.journal.close()
                self.assertNotIn('FIXTURE_NON_SECRETE',journal.read_text(encoding='utf-8'))
                self.assertNotIn('FIXTURE_NON_SECRETE',logs.getvalue())
                self.assertIn('/v1/audio/transcriptions',[r['path'] for r in api.requests])
                self.assertIn('/v1/chat/completions',[r['path'] for r in api.requests])
        finally:
            api.close();server.terminate();server.communicate(timeout=10)

    async def exercise(self,service):
        from websockets.asyncio.client import connect
        seen=[]
        task=asyncio.create_task(service.main())
        try:
            # Le banc attend l'index avant de lire ; une vraie page consomme
            # déjà les états. Borner plus haut évite de bloquer les pongs derrière
            # 16 états pendant les 65 s de préparation tolérées par ce test.
            async with connect(service.args.relais,origin='http://127.0.0.1:18771',max_queue=128) as client:
                deadline=time.monotonic()+65
                while not service.verse_finder or not service.ready.is_set():
                    if time.monotonic()>deadline:self.fail('index/service non prêts')
                    await asyncio.sleep(.05)
                async def command(action):
                    await client.send(json.dumps({'type':'caption_admin','action':action,'id':action+str(time.time()),'ts':int(time.time()*1000)}))
                await command('start')
                async def receive_until(predicate):
                    async with asyncio.timeout(12):
                        while True:
                            m=json.loads(await client.recv());seen.append(m)
                            if predicate(m):return m
                heard=await receive_until(lambda m:m.get('type')=='heard_verse')
                self.assertEqual(heard['proposal']['reference'],'Jean 3:16')
                self.assertIn('Car Dieu a tant aimé',heard['proposal']['text'])
                self.assertTrue(any(m.get('type')=='caption_status' and (m.get('state') or {}).get('listenId')==service.listen_id and (m.get('state') or {}).get('status')=='listening' for m in seen))
                self.assertFalse(any(m.get('type')=='caption' for m in seen),'la recherche n’attend pas la traduction')
                await receive_until(lambda m:m.get('type')=='caption')
                await command('stop')
                await receive_until(lambda m:m.get('type')=='heard_clear')
                await receive_until(lambda m:m.get('type')=='caption_status' and (m.get('state') or {}).get('status')=='idle')
                self.assertFalse(any(m.get('type') in ('show_verse','show_text') for m in seen))
                self.assertEqual(service.engine.status,'idle')
        finally:
            service.stop();task.cancel()
            with contextlib.suppress(asyncio.CancelledError):await task


if __name__=='__main__':unittest.main()

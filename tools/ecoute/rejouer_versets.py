"""Rejoue les transcriptions enregistrées du banc, avec les délais ASR historiques.

Protocole JSONL vers le lanceur de démonstration : ready, puis « start » sur stdin.
Le WAV original est joué par le lanceur à la même origine. Aucun appel API et
aucun accès à l'antenne. La recherche et son travailleur sont ceux du direct.
"""
import argparse
import json
from pathlib import Path
import sys
import threading
import time
from versets import BibleIndex, Finder, StreamFinder, LatestFinder
ROOT=Path(__file__).resolve().parents[2]


def emit(value):
    print(json.dumps(value,ensure_ascii=False),flush=True)


def main():
    p=argparse.ArgumentParser(__doc__)
    p.add_argument('--fixture',default=str(ROOT/'tests/fixtures/heard-demo.json'))
    p.add_argument('--scene',type=int,default=0)
    a=p.parse_args()
    scene=json.loads(Path(a.fixture).read_text(encoding='utf-8'))['clips'][a.scene]
    index=BibleIndex(ROOT/'data')
    runner=LatestFinder(StreamFinder(Finder(index)),lambda result:emit({'type':'heard_verse','proposal':result}),lambda text:emit({'type':'notice','text':text}))
    emit({'type':'ready','scene':scene,'mode':'transcriptions enregistrées, recherche actuelle'})
    if sys.stdin.readline().strip()!='start':return
    origin=time.time()
    runner.start()
    emit({'type':'started','wall':origin})
    for phrase in scene['phrases']:
        target=origin+phrase['end']-scene['start']+.5+phrase['asr_s']
        time.sleep(max(0,target-time.time()))
        runner.submit({'fr':phrase['fr'],'end':(origin+phrase['end']-scene['start'])*1000})
    time.sleep(max(0,origin+scene['end']-scene['start']+2-time.time()))
    runner.close()
    emit({'type':'done'})


if __name__=='__main__':main()

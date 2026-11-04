"""Banc reproductible sans API : transcriptions réelles enregistrées, jamais un score audio inventé.

--source : asr2.json du banc du 02/11 (4 extraits gpt-transcribe).
Le temps local est mesuré ; ASR vient du banc historique. La pause VAD de 0,5 s
est une hypothèse explicitement séparée, pas une mesure du microphone en régie.
"""
import argparse
import hashlib
import json
from pathlib import Path
import statistics
import time
from versets import BibleIndex, Finder, StreamFinder

ROOT = Path(__file__).resolve().parents[2]


def run(source, output):
    raw_bytes = Path(source).read_bytes()
    raw = json.loads(raw_bytes)
    gold = json.loads((ROOT / 'tests/fixtures/heard-gold.json').read_text(encoding='utf-8'))
    expected = gold['clips']
    t0 = time.perf_counter()
    index = BibleIndex(ROOT / 'data')
    loading = time.perf_counter() - t0
    rows, positives, true, false, detected, latencies, search = [], 0, 0, 0, 0, [], []
    for clip, data in raw['extraits'].items():
        finder = StreamFinder(Finder(index))
        for p in data['phrases']:
            actual = p['A']['gpt-transcribe']
            fr = actual['t']
            target = expected[clip].get(str(p['i']), [])
            positives += bool(target)
            before = time.perf_counter()
            result = finder.feed({'fr': fr, 'end': p['fin'] * 1000})
            cost = time.perf_counter() - before
            search.append(cost)
            key = [result[k] for k in ('bookId','chapter','verse','verseEnd')] if result else None
            # Un verset d'une phrase chevauchant deux versets est admis ; un
            # chapitre seul n'est pas assimilé au verset demandé dans ce chapitre.
            correct = bool(key and any(key[0:2] == ref[0:2] and
                ((key[2:] == [0,0] and ref[2:] == [0,0]) or (ref[2] > 0 and key[2] >= ref[2] and key[3] <= ref[3])) for ref in target))
            if result:
                detected += 1
                true += correct
                false += not correct
                latencies.append(actual['s'] + .5 + cost)
            rows.append({'clip':clip, 'i':p['i'], 'start':p['debut'], 'end':p['fin'], 'fr':fr,
                         'asr_s_recorded':actual['s'], 'expected':target, 'proposal':result,
                         'correct':correct, 'search_s':round(cost,5)})
    assert len(rows) == sum(len(d['phrases']) for d in raw['extraits'].values())
    summary = {'mode':'rejeu de transcriptions réelles ; pas une nouvelle mesure audio en régie',
               'source_sha256':hashlib.sha256(raw_bytes).hexdigest(), 'phrases':len(rows),
               'positives':positives, 'proposals':detected, 'true_positives':true, 'false_positives':false,
               'recall':round(true/positives,4), 'precision':round(true/detected,4) if detected else None,
               'search_median_s':round(statistics.median(search),4), 'index_loading_s':round(loading,3),
               'historical_asr_plus_assumed_vad_plus_search_median_s':round(statistics.median(latencies),3) if latencies else None,
               'assumed_vad_pause_s':.5, 'threshold':.9, 'quarantined':index.quarantined,
               'versions_loaded':index.versions,
               'note':'Score par phrase, sans anti-doublon. Les répétitions sont des occasions distinctes. Annotations de développement, non aveugles. Les abstentions sont des faux négatifs lorsqu’un passage est annoté.'}
    output = Path(output); output.mkdir(parents=True,exist_ok=True)
    (output/'banc.json').write_text(json.dumps({'summary':summary,'rows':rows},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))
    print('Propositions fausses :',[(r['clip'],r['i'],r['proposal']['reference']) for r in rows if r['proposal'] and not r['correct']])


if __name__ == '__main__':
    p=argparse.ArgumentParser(__doc__);p.add_argument('--source',required=True);p.add_argument('--sortie',required=True)
    a=p.parse_args();run(a.source,a.sortie)

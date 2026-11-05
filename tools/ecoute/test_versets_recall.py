"""Rappel accru sans relâcher l'abstention ni inventer de référence."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).parent))
from versets import BibleIndex, Finder, StreamFinder, ReferenceParser

ROOT=Path(__file__).resolve().parents[2]
class RecallTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.index=BibleIndex(ROOT/'data')
    def test_candidates_for_short_distinctive_quote_are_not_public(self):
        text="Il dit que le salaire du péché, c'est la mort."
        rows=self.index.rank(text,relaxed=True)
        self.assertTrue(any((r['bookId'],r['chapter'],r['verse'])==(45,6,23) for r in rows))
        self.assertIsNone(Finder(self.index).find(text))
    def test_model_confirms_a_local_candidate_only(self):
        seen=[]
        def choose(text,candidates):
            seen.append(candidates)
            for i,r in enumerate(candidates):
                if (r['bookId'],r['chapter'],r['verse'])==(45,6,23):return {'index':i,'confidence':.99}
        found=Finder(self.index,disambiguate=choose).find("Il dit que le salaire du péché, c'est la mort.")
        self.assertIsNotNone(found)
        self.assertEqual((found['bookId'],found['chapter'],found['verse']),(45,6,23))
        self.assertEqual(found['method'],'model')
        self.assertEqual(found['text'],self.index.texts[(found['version'],45,6,23)])
        self.assertTrue(seen)
    def test_model_threshold_and_schema_fail_closed(self):
        for reply in [{'index':0,'confidence':.97},{'index':True,'confidence':1},{'index':0,'confidence':True},{'index':1000,'confidence':1},{'index':0,'confidence':float('nan')},{'index':0,'confidence':1.1}]:
            with self.subTest(reply=reply):
                self.assertIsNone(Finder(self.index,disambiguate=lambda *_,r=reply:r).find("Il dit que le salaire du péché, c'est la mort."))
        spy=[]
        for text in ['Oui Seigneur amen.', 'Dieu est bon.', 'Le bonheur est dans le pré.', 'Jean 3:16 ou 17, le salaire du péché est la mort.']:
            self.assertIsNone(Finder(self.index,disambiguate=lambda *_:spy.append(1)).find(text),text)
        self.assertFalse(spy)
    def test_split_range_is_strict_and_expires(self):
        s=StreamFinder(Finder(self.index))
        self.assertEqual(s.feed({'fr':'Matthieu 7, 15.','end':1000})['verse'],15)
        r=s.feed({'fr':'À vingt.','end':2000})
        self.assertIsNotNone(r)
        self.assertEqual((r['bookId'],r['chapter'],r['verse'],r['verseEnd']),(40,7,15,20))
        for second,t in [('À vingt.',10000),('À vingt personnes.',2000),('À vingt ou vingt et un.',2000),('À deux.',2000)]:
            s=StreamFinder(Finder(self.index));s.feed({'fr':'Matthieu 7, 15.','end':1000})
            self.assertIsNone(s.feed({'fr':second,'end':t}),second)
    def test_recent_context_is_disambiguation_only(self):
        seen=[]
        def chooser(text,candidates):
            seen.append((text,candidates));return None
        s=StreamFinder(Finder(self.index,disambiguate=chooser))
        s.feed({'fr':'Jésus dit, moi je vais me faire crucifier, je vais partir.','end':1000})
        seen.clear()
        current='Lui dit : à cela ne plaise à Dieu, tu ne mourras pas.'
        s.feed({'fr':current,'end':4000})
        self.assertEqual(len(seen),1,'un seul départage, jamais la concaténation qui recycle une ancienne citation')
        self.assertEqual(seen[0][0],current)
        self.assertIn('Jésus',seen[0][1][0]['recent_context'])
        s.feed({'fr':current,'end':15000})
        self.assertEqual(seen[-1][1][0]['recent_context'],'')
    def test_distinctive_two_word_retrieval_stays_private(self):
        rows=self.index.rank('Mais au-dedans, ce sont des loups féroces.',relaxed=True)
        self.assertTrue(any((r['bookId'],r['chapter'],r['verse'])==(40,7,15) for r in rows))
        self.assertIsNone(Finder(self.index).find('Mais au-dedans, ce sont des loups féroces.'))
    def test_spoken_number_labels(self):
        p=ReferenceParser(self.index)
        for text in ['Jean chapitre numéro trois verset numéro seize','Jean chapitre trois, au seizième verset','Jean chapitre trois verset seizième']:
            self.assertEqual([tuple(r[k] for k in ('bookId','chapter','verse','verseEnd')) for r in p.parse(text)],[(43,3,16,16)],text)
        for text in ['Jean chapitre numéro trois verset seize ou dix-sept','Jean chapitre trois verset seizième à']:
            self.assertEqual(p.parse(text),[],text)

if __name__=='__main__':unittest.main()

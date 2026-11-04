"""Installation locale réversible du paquet, sans lancer ni arrêter aucun service.

Inspection par défaut ; --appliquer exige --accord-math et une régie arrêtée.
Le manifeste verrouille contenu ET versions de départ. Les secrets, journaux,
modèles et données de l'opérateur ne font jamais partie du paquet.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import time
import os
import tempfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def child(root, relative):
    p=Path(relative)
    if p.is_absolute() or '..' in p.parts or '\\' in relative:
        raise ValueError('Chemin de paquet interdit')
    target=root/p
    if root.resolve() not in target.resolve().parents:
        raise ValueError('Chemin hors cible')
    if any(x.is_symlink() for x in [target,*target.parents] if x!=root.parent):
        raise ValueError('Lien symbolique interdit dans la cible')
    return target


def atomic_write(dest,data):
    fd,name=tempfile.mkstemp(prefix=dest.name+'.',suffix='.tmp',dir=dest.parent)
    os.close(fd);temporary=Path(name)
    try:
        temporary.write_bytes(data)
        if sha(temporary.read_bytes())!=sha(data):raise OSError('Écriture temporaire non vérifiée')
        if dest.exists():os.chmod(temporary,dest.stat().st_mode & 0o777)
        temporary.replace(dest)
    finally:temporary.unlink(missing_ok=True)


def apply(package,target,approved=False):
    package,target=Path(package).resolve(),Path(target).resolve()
    if not (target/'control_panel.html').is_file() or not (target/'tools/server.js').is_file():
        raise ValueError('Cible non reconnue : choisissez le dossier VerseObs existant')
    manifest=json.loads((package/'manifest.json').read_text(encoding='utf-8'))
    payload=package/'payload'
    plan=[]
    for entry in manifest['files']:
        relative=entry['path'];source=child(payload,relative);dest=child(target,relative)
        data=source.read_bytes()
        if sha(data)!=entry['sha256']:raise ValueError('Paquet altéré : '+relative)
        before=dest.read_bytes() if dest.exists() else None
        old=sha(before) if before is not None else None
        if old not in [*entry['accepted_before'],entry['sha256']]:
            raise ValueError('Modification locale inconnue, installation refusée : '+relative)
        plan.append((relative,data,before))
    if not approved:
        return {'mode':'inspection seulement','files':len(plan),'target':str(target),'commit':manifest['commit']}
    backup=target.parent/(target.name+'-retour-versets-'+time.strftime('%Y%m%d-%H%M%S'))
    backup.mkdir(exist_ok=False)
    records=[]
    for relative,data,before in plan:
        records.append({'path':relative,'before':sha(before) if before is not None else None,'installed':sha(data)})
        if before is not None:
            saved=child(backup/'files',relative);saved.parent.mkdir(parents=True,exist_ok=True);saved.write_bytes(before)
    journal={'target':str(target),'files':records,'commit':manifest['commit']}
    (backup/'retour.json').write_text(json.dumps(journal,ensure_ascii=False,indent=2),encoding='utf-8')
    completed=[]
    try:
        for relative,data,before in plan:
            dest=child(target,relative);dest.parent.mkdir(parents=True,exist_ok=True)
            completed.append((relative,before))
            atomic_write(dest,data)
            if sha(dest.read_bytes())!=sha(data):raise OSError('Vérification échouée : '+relative)
    except Exception:
        for relative,before in reversed(completed):
            dest=child(target,relative)
            if before is None:dest.unlink(missing_ok=True)
            else:
                atomic_write(dest,before)
                if sha(dest.read_bytes())!=sha(before):raise OSError('Restauration non vérifiée : '+relative)
        raise
    return {'mode':'installé, fichiers relus','backup':str(backup),'files':len(plan),'commit':manifest['commit']}


def rollback(backup,approved=False):
    backup=Path(backup).resolve();journal=json.loads((backup/'retour.json').read_text(encoding='utf-8'))
    target=Path(journal['target']).resolve();plan=[]
    for entry in journal['files']:
        dest=child(target,entry['path'])
        if not dest.is_file() or sha(dest.read_bytes())!=entry['installed']:
            raise ValueError('Fichier modifié depuis l’installation : '+entry['path'])
        before=child(backup/'files',entry['path']).read_bytes() if entry['before'] else None
        if before is not None and sha(before)!=entry['before']:raise ValueError('Sauvegarde altérée')
        plan.append((dest,before))
    if approved:
        for dest,before in plan:
            if before is None:dest.unlink()
            else:
                atomic_write(dest,before)
                if sha(dest.read_bytes())!=sha(before):raise OSError('Retour non vérifié')
    return {'mode':'retour effectué, fichiers relus' if approved else 'inspection du retour','target':str(target),'files':len(plan)}


def main():
    p=argparse.ArgumentParser(__doc__)
    p.add_argument('--cible');p.add_argument('--paquet',default=str(Path(__file__).resolve().parent))
    p.add_argument('--retour');p.add_argument('--appliquer',action='store_true');p.add_argument('--accord-math',action='store_true')
    a=p.parse_args()
    if a.appliquer and not a.accord_math:p.error('Validation de Math requise (--accord-math)')
    if bool(a.retour)==bool(a.cible):p.error('Choisissez --cible OU --retour')
    result=rollback(a.retour,a.appliquer) if a.retour else apply(a.paquet,a.cible,a.appliquer)
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()

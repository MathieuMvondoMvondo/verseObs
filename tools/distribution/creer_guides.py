"""Fabrication mainteneur des guides illustrés, une page chacun (ReportLab)."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle

ROOT=Path(__file__).resolve().parent
FONT=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
pdfmetrics.registerFont(TTFont('Guide',str(FONT)))
pdfmetrics.registerFont(TTFont('GuideBold',str(FONT.with_name('DejaVuSans-Bold.ttf'))))
for system in ('MAC','WINDOWS'):
    c=canvas.Canvas(str(ROOT/('GUIDE-'+system+'.pdf')),pagesize=A4,invariant=1)
    c.setTitle('VerseObs — démarrer sur '+system);c.setAuthor('VerseObs')
    W,H=A4;c.setFillColor(HexColor('#f7f6f2'));c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(HexColor('#17292a'));c.setFont('GuideBold',32);c.drawString(40,H-62,'VerseObs')
    c.setFont('Guide',15);c.drawString(40,H-90,'Votre régie sur '+('Mac' if system=='MAC' else 'Windows'))
    c.setFont('Guide',10);c.drawString(40,H-114,'Aucune commande à saisir. Aucun logiciel à installer à la main.')
    mac=system=='MAC';suffix='.command' if mac else '.cmd'
    steps=[
      ('Télécharger et ouvrir', 'Téléchargez le zip '+('Mac' if mac else 'Windows')+'. '+('Double-cliquez sur le zip.' if mac else 'Clic droit sur le zip, puis « Extraire tout ».')+' Gardez le dossier VerseObs dans Documents. Ne lancez rien directement depuis le zip.'),
      ('Installer — une seule fois','Double-cliquez sur <b>Installer VerseObs'+suffix+'</b>. Internet est nécessaire. L’installation vérifie ses téléchargements et prépare l’écoute. Laissez-la finir : aucun mot de passe administrateur, Python ou Node à chercher.'),
      ('Lancer pour la séance','Double-cliquez sur <b>Lancer VerseObs'+suffix+'</b>'+(' (ou VerseObs sur le Bureau)' if not mac else '')+'. Le Studio s’ouvre dans votre navigateur. Dans <b>Connexions › Sous-titres anglais</b>, choisissez le micro et cliquez sur <b>Démarrer l’écoute</b>.')]
    style=ParagraphStyle('body',fontName='Guide',fontSize=10.5,leading=16,textColor=HexColor('#17292a'))
    y=H-144
    for i,(title,body) in enumerate(steps,1):
        c.setFillColor(HexColor('#ffffff'));c.roundRect(32,y-135,W-64,129,10,fill=1,stroke=0)
        c.setFillColor(HexColor('#315d5a'));c.circle(64,y-36,18,fill=1,stroke=0)
        c.setFillColor(HexColor('#ffffff'));c.setFont('GuideBold',17);c.drawCentredString(64,y-42,str(i))
        c.setFillColor(HexColor('#17292a'));c.setFont('GuideBold',14);c.drawString(96,y-32,title)
        # Petites illustrations : téléchargement, paquet et lecture.
        x=W-69;c.setStrokeColor(HexColor('#315d5a'));c.setLineWidth(2)
        if i==1:
            c.line(x,y-18,x,y-38);c.line(x-6,y-32,x,y-38);c.line(x+6,y-32,x,y-38);c.line(x-10,y-44,x+10,y-44)
        elif i==2:c.rect(x-10,y-42,20,20);c.line(x-10,y-28,x+10,y-28)
        else:
            p=c.beginPath();p.moveTo(x-8,y-42);p.lineTo(x+10,y-30);p.lineTo(x-8,y-18);p.close();c.drawPath(p,stroke=1)
        paragraph=Paragraph(body,style);_,h=paragraph.wrap(W-146,95);paragraph.drawOn(c,96,y-48-h)
        y-=144
    security=('La première fois : clic droit sur le fichier › Ouvrir. Si macOS le demande : Réglages Système › Confidentialité et sécurité › Ouvrir quand même. Autorisez le Microphone pour Terminal. Ne désactivez pas la sécurité du Mac.' if mac else 'Si SmartScreen apparaît : Informations complémentaires › Exécuter quand même, après vérification de la provenance du zip. Micro bloqué : Paramètres › Confidentialité et sécurité (Windows 11) ou Confidentialité (Windows 10) › Microphone › Autoriser les applications de bureau à accéder à votre microphone. Relancez VerseObs. Sur un poste géré, contactez son responsable si cette option est bloquée.')
    p=Paragraph('<b>Lors de la première ouverture</b><br/>'+security,style);_,h=p.wrap(W-80,110);p.drawOn(c,40,y-5-h)
    y-=h+25
    end=('Gardez la fenêtre VerseObs ouverte. La fermer arrête le serveur et l’écoute.' if mac else 'Gardez la petite fenêtre VerseObs ouverte. « Arrêter VerseObs » ou sa croix arrête le serveur et l’écoute.')
    p=Paragraph('<b>À la fin</b> — '+end+'<br/><b>À prévoir</b> — Internet pour la première installation et environ 4 Go libres. Sans clé payante, l’écoute reste locale. Faites un essai complet avant le culte.',style);_,h=p.wrap(W-80,100);p.drawOn(c,40,y-h)
    c.setFont('Guide',8);c.setFillColor(HexColor('#526460'));c.drawString(40,24,'VerseObs 2.93 · Version à essayer par Math sur le Mac/PC cible · Garder le dossier Application en place.')
    c.showPage();c.save()

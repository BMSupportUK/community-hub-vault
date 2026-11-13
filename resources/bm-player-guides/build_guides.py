import json, re, subprocess, requests, html
from pathlib import Path
from bs4 import BeautifulSoup
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
rows=json.load(open('resources/bm-player-guides/content.json'))
Path('/tmp/bm-guides').mkdir(parents=True, exist_ok=True)
Path('resources/bm-player-guides/content.json').write_text(json.dumps(rows,indent=2))
for face,name in [('DejaVu Sans','Guide'),('DejaVu Sans:bold','GuideBold')]:
 pdfmetrics.registerFont(TTFont(name,subprocess.check_output(['fc-match','-f','%{file}',face],text=True).strip()))
styles=getSampleStyleSheet()
for style in styles.byName.values(): style.fontName='Guide'; style.leading=20
styles['Title'].fontName='GuideBold'; styles['Title'].fontSize=25; styles['Title'].leading=31; styles['Title'].textColor=HexColor('#34245c')
styles['Heading1'].fontName='GuideBold'; styles['Heading1'].textColor=HexColor('#34245c'); styles['Heading1'].spaceAfter=16
styles['Normal'].fontSize=12; styles['Normal'].spaceAfter=12

def footer(c,doc):
 c.setStrokeColor(HexColor('#d6d1df')); c.line(44,43,A4[0]-44,43)
 c.setFont('Guide',9); c.setFillColor(HexColor('#665f73')); c.drawString(44,29,'BM Support | BM Player User Guides'); c.drawRightString(A4[0]-44,29,str(doc.page))
for row in rows:
 soup=BeautifulSoup(row['body'],'html.parser')
 image=Path('/tmp/bm-guides/'+row['slug']+'.jpg'); image.write_bytes(requests.get(row['image_url']).content)
 flow=[Paragraph(html.escape(row['title']),styles['Title']),Spacer(1,18)]
 from PIL import Image as PI
 w,h=PI.open(image).size
 flow += [Image(str(image),width=507,height=507*h/w),Spacer(1,20),Paragraph(html.escape(row['excerpt']),styles['Normal']),Paragraph('BM Player • User guide',styles['Heading2'])]
 for node in soup.children:
  if not getattr(node,'name',None) or node.find('img'): continue
  if node.name=='h2':
   if node.get_text() not in ['Household rules','Need help?','Remote controls','Phone tips','Desktop tips','Install on Mac']: flow += [PageBreak()]
   else: flow += [Spacer(1,20)]
   flow += [Paragraph(node.get_text(),styles['Heading1'])]
  elif node.name in ['ul','ol']:
   for i,li in enumerate(node.find_all('li',recursive=False)):
    text=html.escape(li.get_text())
    flow += [Paragraph((str(i+1)+'. ' if node.name=='ol' else '• ')+text,styles['Normal'])]
  else: flow += [Paragraph(html.escape(node.get_text()),styles['Normal'])]
 dest='resources/bm-player-guides/'+row['slug']+'-v2.pdf'
 SimpleDocTemplate(dest,pagesize=A4,rightMargin=44,leftMargin=44,topMargin=45,bottomMargin=60,title=row['title'],author='BM Support').build(flow,onFirstPage=footer,onLaterPages=footer)
 print(dest)

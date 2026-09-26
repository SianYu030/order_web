#!/usr/bin/env python3
import json, math, os, random, subprocess, wave
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W,H=720,1280
FPS=24
TOTAL=30.0
ROOT=Path(__file__).resolve().parent
STORY=ROOT/"story.json"
OUT=ROOT/"output.mp4"
AUDIO=ROOT/"_audio.wav"
META=ROOT/"metadata.json"
SCENE_DIR=ROOT/"_scenes"

FONT_CANDIDATES=[
"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
"/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
"/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
FONT_BOLD_CANDIDATES=[
"/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
"/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
"/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]

def font(size,bold=False):
    for p in (FONT_BOLD_CANDIDATES if bold else FONT_CANDIDATES):
        if os.path.exists(p):
            return ImageFont.truetype(p,size=size)
    return ImageFont.load_default()

def wrap_text(text,fnt,max_width):
    words=str(text).split()
    if not words:return ""
    d=ImageDraw.Draw(Image.new("RGB",(10,10)))
    lines=[];cur=words[0]
    for w in words[1:]:
        t=cur+" "+w
        if d.textbbox((0,0),t,font=fnt)[2]<=max_width:cur=t
        else:lines.append(cur);cur=w
    lines.append(cur)
    return "\n".join(lines[:4])

def gradient(top,bottom):
    img=Image.new("RGB",(W,H));d=ImageDraw.Draw(img)
    steps=64
    for i in range(steps):
        y0=int(H*i/steps);y1=int(H*(i+1)/steps)+1;t=i/(steps-1)
        c=tuple(int(top[j]*(1-t)+bottom[j]*t) for j in range(3))
        d.rectangle((0,y0,W,y1),fill=c)
    return img

def bg(kind,seed):
    rng=random.Random(seed)
    pal={"rain":((35,45,65),(85,100,125)),"street":((72,86,105),(165,175,185)),
         "park":((135,195,235),(220,245,225)),"home":((235,218,190),(250,242,225)),
         "sunset":((255,168,120),(112,92,162)),"night":((20,28,52),(55,64,92))}
    img=gradient(*pal.get(kind,pal["park"]));d=ImageDraw.Draw(img)
    if kind in ("park","sunset"):
        d.rectangle((0,int(H*.62),W,H),fill=(78,145,85))
        for tx in (100,580):
            d.rectangle((tx-15,int(H*.42),tx+15,int(H*.68)),fill=(105,75,52))
            d.ellipse((tx-80,int(H*.33),tx+80,int(H*.52)),fill=(75,145,78))
    elif kind=="home":
        d.rectangle((0,int(H*.62),W,H),fill=(178,138,105))
        d.rectangle((55,120,310,430),fill=(156,205,235),outline=(255,255,255),width=10)
        d.line((182,120,182,430),fill=(255,255,255),width=8);d.line((55,275,310,275),fill=(255,255,255),width=8)
        d.rounded_rectangle((430,160,650,520),radius=16,fill=(185,130,80))
    elif kind=="street":
        d.rectangle((0,int(H*.62),W,H),fill=(70,72,78))
        d.rounded_rectangle((90,560,360,700),radius=18,fill=(92,64,42))
    elif kind=="rain":
        d.rectangle((0,int(H*.65),W,H),fill=(62,68,78))
        for _ in range(80):
            x=rng.randint(0,W);y=rng.randint(0,H);d.line((x,y,x-8,y+28),fill=(190,215,235),width=2)
    elif kind=="night":
        d.rectangle((0,int(H*.68),W,H),fill=(45,55,58))
        for _ in range(50):
            x=rng.randint(0,W);y=rng.randint(0,int(H*.55));r=rng.choice([1,2,3])
            d.ellipse((x-r,y-r,x+r,y+r),fill=(240,240,210))
    return img

def face(d,cx,cy,r,emotion):
    ey=cy-int(r*.12);er=max(3,int(r*.07))
    for ex in (cx-int(r*.34),cx+int(r*.34)): d.ellipse((ex-er,ey-er,ex+er,ey+er),fill=(25,25,25))
    if emotion in ("sad","hopeful"): d.arc((cx-int(r*.35),cy+int(r*.10),cx+int(r*.35),cy+int(r*.45)),200,340,fill=(40,40,40),width=max(2,int(r*.04)))
    elif emotion=="surprised":
        rr=max(5,int(r*.11));d.ellipse((cx-rr,cy+int(r*.16)-rr,cx+rr,cy+int(r*.16)+rr),outline=(40,40,40),width=max(2,int(r*.04)))
    else:d.arc((cx-int(r*.35),cy,cx+int(r*.35),cy+int(r*.38)),15,165,fill=(40,40,40),width=max(2,int(r*.04)))

def dog(d,x,y,s,e):
    cx,cy=int(W*x),int(H*y);r=int(82*s)
    d.ellipse((cx-int(86*s),cy+int(45*s),cx+int(86*s),cy+int(185*s)),fill=(198,142,83),outline=(100,70,45),width=max(2,int(5*s)))
    d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(218,164,99),outline=(100,70,45),width=max(2,int(5*s)))
    d.polygon([(cx-r+8,cy-r+18),(cx-r-int(50*s),cy-int(35*s)),(cx-int(35*s),cy+int(15*s))],fill=(150,95,55))
    d.polygon([(cx+r-8,cy-r+18),(cx+r+int(50*s),cy-int(35*s)),(cx+int(35*s),cy+int(15*s))],fill=(150,95,55))
    d.ellipse((cx-int(22*s),cy+int(12*s),cx+int(22*s),cy+int(42*s)),fill=(40,35,30));face(d,cx,cy,r,e)

def cat(d,x,y,s,e):
    cx,cy=int(W*x),int(H*y);r=int(70*s)
    d.ellipse((cx-int(72*s),cy+int(38*s),cx+int(72*s),cy+int(160*s)),fill=(145,150,158),outline=(70,72,78),width=max(2,int(4*s)))
    d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(170,175,182),outline=(70,72,78),width=max(2,int(4*s)))
    d.polygon([(cx-r+10,cy-r+20),(cx-int(45*s),cy-r-int(52*s)),(cx-int(10*s),cy-r+8)],fill=(155,160,168))
    d.polygon([(cx+r-10,cy-r+20),(cx+int(45*s),cy-r-int(52*s)),(cx+int(10*s),cy-r+8)],fill=(155,160,168))
    d.ellipse((cx-int(14*s),cy+int(12*s),cx+int(14*s),cy+int(30*s)),fill=(65,65,70));face(d,cx,cy,r,e)

def scene_image(scene,idx,title):
    img=bg(scene.get("background","park"),idx*7919+17);d=ImageDraw.Draw(img)
    for a in scene.get("actors",[]):
        (dog if a.get("type")=="dog" else cat)(d,float(a.get("x",.5)),float(a.get("y",.66)),float(a.get("scale",1)),a.get("emotion","calm"))
    if idx==0:
        tf=font(54,True);txt=wrap_text(title,tf,W-90);bb=d.multiline_textbbox((0,0),txt,font=tf,spacing=8,align="center");tw=bb[2]-bb[0]
        d.multiline_text(((W-tw)//2,70),txt,font=tf,fill="white",spacing=8,align="center",stroke_width=3,stroke_fill="black")
    cf=font(48,True);txt=wrap_text(scene.get("caption",""),cf,W-120);bb=d.multiline_textbbox((0,0),txt,font=cf,spacing=10,align="center");th=bb[3]-bb[1]
    y0=H-th-150;d.rounded_rectangle((45,y0-35,W-45,H-65),radius=28,fill=(0,0,0))
    d.multiline_text((W//2,y0),txt,font=cf,fill="white",anchor="ma",align="center",spacing=10,stroke_width=2,stroke_fill="black")
    return img

def synth(path,duration):
    sr=44100;notes=[220,277.18,329.63,392,329.63,277.18]
    with wave.open(str(path),"w") as wf:
        wf.setnchannels(1);wf.setsampwidth(2);wf.setframerate(sr)
        frames=bytearray()
        for i in range(int(duration*sr)):
            t=i/sr;n=notes[int(t/2.5)%len(notes)]
            v=(math.sin(2*math.pi*n*t)+.45*math.sin(2*math.pi*n*1.5*t))*.045
            frames+=int(max(-1,min(1,v))*32767).to_bytes(2,"little",signed=True)
        wf.writeframes(frames)

def render(story):
    scenes=story.get("scenes") or []
    if len(scenes)<2:raise SystemExit("Need at least 2 scenes")
    SCENE_DIR.mkdir(exist_ok=True)
    per=TOTAL/len(scenes)
    pngs=[]
    for i,s in enumerate(scenes):
        p=SCENE_DIR/f"{i:02d}.png";scene_image(s,i,story.get("title","Animal Story")).save(p,quality=95);pngs.append(p)
    synth(AUDIO,TOTAL)
    cmd=["ffmpeg","-y"]
    for p in pngs:cmd += ["-loop","1","-t",f"{per:.3f}","-i",str(p)]
    cmd += ["-i",str(AUDIO)]
    filters=[]
    for i in range(len(pngs)):
        filters.append(f"[{i}:v]scale={W}:{H},setsar=1,fade=t=in:st=0:d=0.20,fade=t=out:st={max(0,per-.20):.3f}:d=0.20[v{i}]")
    filters.append("".join(f"[v{i}]" for i in range(len(pngs)))+f"concat=n={len(pngs)}:v=1:a=0[v]")
    cmd += ["-filter_complex",";".join(filters),"-map","[v]","-map",f"{len(pngs)}:a","-r",str(FPS),"-c:v","libx264","-preset","veryfast","-crf","22","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-shortest",str(OUT)]
    subprocess.run(cmd,check=True)
    META.write_text(json.dumps({
        "story_id":story.get("story_id","unknown"),"title":story.get("title","Animal Story")[:100],
        "description":story.get("description",""),"hashtags":story.get("hashtags",[]),
        "category_id":story.get("category_id","15"),"made_for_kids":bool(story.get("made_for_kids",False)),
        "synthetic_media":bool(story.get("synthetic_media",False))},ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"Rendered {OUT}")

if __name__=="__main__":
    render(json.loads(STORY.read_text(encoding="utf-8")))

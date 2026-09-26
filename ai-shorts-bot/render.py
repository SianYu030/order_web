#!/usr/bin/env python3
import json, math, os, random, subprocess, wave
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

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
"/usr/share/truetype/dejavu/DejaVuSans-Bold.ttf"]

def font(size,bold=False):
    for p in (FONT_BOLD_CANDIDATES if bold else FONT_CANDIDATES):
        if os.path.exists(p):
            return ImageFont.truetype(p,size=size)
    return ImageFont.load_default()

def text_width(d,txt,fnt):
    bb=d.textbbox((0,0),txt,font=fnt)
    return bb[2]-bb[0]

def wrap_text(text,fnt,max_width,max_lines=2):
    words=str(text).strip().split()
    if not words:return ""
    d=ImageDraw.Draw(Image.new("RGB",(10,10)))
    lines=[];cur=words[0]
    for w in words[1:]:
        t=cur+" "+w
        if text_width(d,t,fnt)<=max_width:
            cur=t
        else:
            lines.append(cur);cur=w
    lines.append(cur)
    if len(lines)>max_lines:
        keep=lines[:max_lines]
        while text_width(d,keep[-1]+"…",fnt)>max_width and len(keep[-1])>2:
            keep[-1]=keep[-1][:-1]
        keep[-1]=keep[-1].rstrip()+"…"
        lines=keep
    return "\n".join(lines)

def gradient(top,bottom):
    img=Image.new("RGB",(W,H));d=ImageDraw.Draw(img)
    steps=96
    for i in range(steps):
        y0=int(H*i/steps);y1=int(H*(i+1)/steps)+1;t=i/(steps-1)
        c=tuple(int(top[j]*(1-t)+bottom[j]*t) for j in range(3))
        d.rectangle((0,y0,W,y1),fill=c)
    return img

def vignette(img):
    mask=Image.new("L",(W,H),0)
    md=ImageDraw.Draw(mask)
    md.ellipse((-160,-120,W+160,H+160),fill=210)
    mask=mask.filter(ImageFilter.GaussianBlur(110))
    shade=Image.new("RGB",(W,H),(0,0,0))
    return Image.composite(img,shade,mask)

def glow(img,xy,r,color,alpha=80):
    ov=Image.new("RGBA",(W,H),(0,0,0,0))
    d=ImageDraw.Draw(ov)
    cx,cy=xy
    for k in range(6,0,-1):
        rr=int(r*k/6)
        a=int(alpha*(1-k/7)/2)
        d.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),fill=(*color,a))
    ov=ov.filter(ImageFilter.GaussianBlur(max(8,r//6)))
    return Image.alpha_composite(img.convert("RGBA"),ov).convert("RGB")

def bg(kind,seed):
    rng=random.Random(seed)
    pal={"rain":((28,37,58),(76,92,120)),"street":((64,76,96),(176,184,194)),
         "park":((117,181,226),(213,242,224)),"home":((225,205,180),(250,239,220)),
         "sunset":((255,164,104),(92,72,148)),"night":((15,22,45),(45,55,88))}
    img=gradient(*pal.get(kind,pal["park"]));d=ImageDraw.Draw(img)

    # soft horizon / cinematic depth
    if kind in ("park","sunset"):
        d.rectangle((0,int(H*.62),W,H),fill=(66,126,76))
        for tx,scale in [(95,.9),(600,1.05)]:
            trunk=int(28*scale); crown=int(76*scale)
            d.rectangle((tx-trunk//2,int(H*.43),tx+trunk//2,int(H*.70)),fill=(102,74,52))
            d.ellipse((tx-crown,int(H*.31),tx+crown,int(H*.50)),fill=(64,130,72))
        if kind=="sunset":
            img=glow(img,(570,235),130,(255,204,120),100)
    elif kind=="home":
        d.rectangle((0,int(H*.64),W,H),fill=(163,122,92))
        d.rounded_rectangle((40,125,315,455),radius=20,fill=(148,197,228),outline=(246,246,246),width=10)
        d.line((177,125,177,455),fill=(246,246,246),width=8)
        d.line((40,290,315,290),fill=(246,246,246),width=8)
        d.rounded_rectangle((450,160,665,535),radius=20,fill=(170,118,74))
        d.ellipse((585,340,605,360),fill=(237,202,110))
        img=glow(img,(190,225),120,(255,238,185),65)
    elif kind=="street":
        d.rectangle((0,int(H*.64),W,H),fill=(63,66,73))
        d.rounded_rectangle((75,560,370,705),radius=20,fill=(88,62,45))
        for x in range(80,W,150):
            d.rectangle((x,740,x+70,750),fill=(205,193,150))
    elif kind=="rain":
        d.rectangle((0,int(H*.66),W,H),fill=(55,61,72))
        for _ in range(115):
            x=rng.randint(-20,W+20);y=rng.randint(0,H);ln=rng.randint(18,34)
            d.line((x,y,x-8,y+ln),fill=(178,205,230),width=2)
        img=glow(img,(125,220),110,(170,205,255),45)
    elif kind=="night":
        d.rectangle((0,int(H*.69),W,H),fill=(39,49,55))
        for _ in range(60):
            x=rng.randint(0,W);y=rng.randint(0,int(H*.55));r=rng.choice([1,1,2,3])
            d.ellipse((x-r,y-r,x+r,y+r),fill=(240,240,211))
        img=glow(img,(560,180),120,(218,226,255),75)

    # floor shadow gradient
    ov=Image.new("RGBA",(W,H),(0,0,0,0));od=ImageDraw.Draw(ov)
    od.rectangle((0,int(H*.74),W,H),fill=(0,0,0,28))
    img=Image.alpha_composite(img.convert("RGBA"),ov).convert("RGB")
    return img

def draw_shadow(d,cx,cy,rx,ry):
    d.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),fill=(0,0,0,45))

def face(d,cx,cy,r,emotion):
    ey=cy-int(r*.10)
    eye_dx=int(r*.34)
    er=max(4,int(r*.075))
    for ex in (cx-eye_dx,cx+eye_dx):
        d.ellipse((ex-er,ey-er,ex+er,ey+er),fill=(28,28,30))
        d.ellipse((ex-er//2,ey-er//2,ex,ey),fill=(255,255,255))
    if emotion=="sad":
        d.arc((cx-int(r*.34),cy+int(r*.08),cx+int(r*.34),cy+int(r*.44)),200,340,fill=(48,40,38),width=max(3,int(r*.045)))
    elif emotion=="surprised":
        rr=max(6,int(r*.12))
        d.ellipse((cx-rr,cy+int(r*.18)-rr,cx+rr,cy+int(r*.18)+rr),outline=(48,40,38),width=max(3,int(r*.045)))
    elif emotion=="hopeful":
        d.arc((cx-int(r*.28),cy+int(r*.02),cx+int(r*.28),cy+int(r*.32)),20,160,fill=(48,40,38),width=max(3,int(r*.04)))
    else:
        d.arc((cx-int(r*.34),cy,cx+int(r*.34),cy+int(r*.36)),15,165,fill=(48,40,38),width=max(3,int(r*.045)))

def dog(d,x,y,s,e):
    cx,cy=int(W*x),int(H*y);r=int(79*s)
    draw_shadow(d,cx,cy+int(190*s),int(105*s),int(22*s))
    # tail
    d.arc((cx+int(42*s),cy+int(72*s),cx+int(150*s),cy+int(180*s)),220,355,fill=(120,82,51),width=max(4,int(15*s)))
    # body + chest
    d.ellipse((cx-int(82*s),cy+int(46*s),cx+int(82*s),cy+int(192*s)),fill=(194,137,81),outline=(91,62,43),width=max(3,int(5*s)))
    d.ellipse((cx-int(43*s),cy+int(65*s),cx+int(43*s),cy+int(165*s)),fill=(235,198,146))
    # paws
    d.rounded_rectangle((cx-int(62*s),cy+int(154*s),cx-int(22*s),cy+int(210*s)),radius=max(6,int(10*s)),fill=(180,121,72))
    d.rounded_rectangle((cx+int(22*s),cy+int(154*s),cx+int(62*s),cy+int(210*s)),radius=max(6,int(10*s)),fill=(180,121,72))
    # head/ears
    d.polygon([(cx-r+8,cy-r+20),(cx-r-int(52*s),cy-int(30*s)),(cx-int(39*s),cy+int(18*s))],fill=(139,89,54))
    d.polygon([(cx+r-8,cy-r+20),(cx+r+int(52*s),cy-int(30*s)),(cx+int(39*s),cy+int(18*s))],fill=(139,89,54))
    d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(220,166,104),outline=(91,62,43),width=max(3,int(5*s)))
    # muzzle
    d.ellipse((cx-int(36*s),cy+int(5*s),cx+int(36*s),cy+int(50*s)),fill=(239,205,159))
    d.ellipse((cx-int(18*s),cy+int(8*s),cx+int(18*s),cy+int(32*s)),fill=(48,39,34))
    face(d,cx,cy,r,e)
    # collar
    d.arc((cx-int(62*s),cy+int(47*s),cx+int(62*s),cy+int(90*s)),5,175,fill=(56,104,175),width=max(4,int(8*s)))

def cat(d,x,y,s,e):
    cx,cy=int(W*x),int(H*y);r=int(68*s)
    draw_shadow(d,cx,cy+int(168*s),int(88*s),int(18*s))
    # tail
    d.arc((cx+int(28*s),cy+int(55*s),cx+int(145*s),cy+int(180*s)),210,350,fill=(99,105,116),width=max(4,int(13*s)))
    d.ellipse((cx-int(68*s),cy+int(38*s),cx+int(68*s),cy+int(164*s)),fill=(145,151,161),outline=(64,69,78),width=max(3,int(4*s)))
    d.rounded_rectangle((cx-int(50*s),cy+int(140*s),cx-int(18*s),cy+int(190*s)),radius=max(5,int(8*s)),fill=(132,138,148))
    d.rounded_rectangle((cx+int(18*s),cy+int(140*s),cx+int(50*s),cy+int(190*s)),radius=max(5,int(8*s)),fill=(132,138,148))
    d.polygon([(cx-r+10,cy-r+20),(cx-int(45*s),cy-r-int(54*s)),(cx-int(10*s),cy-r+10)],fill=(150,156,166))
    d.polygon([(cx+r-10,cy-r+20),(cx+int(45*s),cy-r-int(54*s)),(cx+int(10*s),cy-r+10)],fill=(150,156,166))
    d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(174,180,189),outline=(64,69,78),width=max(3,int(4*s)))
    # cheek/muzzle
    d.ellipse((cx-int(34*s),cy+int(5*s),cx+int(34*s),cy+int(42*s)),fill=(202,206,212))
    d.polygon([(cx,cy+int(12*s)),(cx-int(12*s),cy+int(25*s)),(cx+int(12*s),cy+int(25*s))],fill=(91,72,78))
    # whiskers
    for yy in (-3,9):
        d.line((cx-int(28*s),cy+int(26*s+yy),cx-int(75*s),cy+int(19*s+yy)),fill=(95,99,106),width=max(1,int(2*s)))
        d.line((cx+int(28*s),cy+int(26*s+yy),cx+int(75*s),cy+int(19*s+yy)),fill=(95,99,106),width=max(1,int(2*s)))
    face(d,cx,cy,r,e)

def rounded_panel(img,box,alpha=165,radius=28):
    ov=Image.new("RGBA",(W,H),(0,0,0,0))
    d=ImageDraw.Draw(ov)
    d.rounded_rectangle(box,radius=radius,fill=(10,14,22,alpha))
    return Image.alpha_composite(img.convert("RGBA"),ov).convert("RGB")

def scene_image(scene,idx,title):
    img=bg(scene.get("background","park"),idx*7919+17)
    d=ImageDraw.Draw(img,"RGBA")
    for a in scene.get("actors",[]):
        (dog if a.get("type")=="dog" else cat)(
            d,float(a.get("x",.5)),float(a.get("y",.62)),
            float(a.get("scale",1)),a.get("emotion","calm")
        )

    # First-scene hook: high enough to avoid top app chrome
    if idx==0:
        hook=wrap_text(title,font(42,True),560,2)
        bb=d.multiline_textbbox((0,0),hook,font=font(42,True),spacing=6,align="center")
        th=bb[3]-bb[1]
        img=rounded_panel(img,(62,104,W-62,104+th+42),150,24)
        d=ImageDraw.Draw(img,"RGBA")
        d.multiline_text((W//2,124),hook,font=font(42,True),fill=(255,255,255,255),
                         anchor="ma",align="center",spacing=6,stroke_width=2,stroke_fill=(0,0,0,130))

    # Caption safe zone: intentionally above Shorts title/buttons
    caption=wrap_text(scene.get("caption",""),font(40,True),520,2)
    cf=font(40,True)
    bb=d.multiline_textbbox((0,0),caption,font=cf,spacing=8,align="center")
    th=bb[3]-bb[1]
    center_y=875
    y1=int(center_y-th/2-30); y2=int(center_y+th/2+30)
    img=rounded_panel(img,(70,y1,W-70,y2),178,26)
    d=ImageDraw.Draw(img,"RGBA")
    d.multiline_text((W//2,center_y),caption,font=cf,fill=(255,255,255,255),
                     anchor="mm",align="center",spacing=8,stroke_width=2,stroke_fill=(0,0,0,150))

    # small progress dots, away from YouTube controls
    dots_y=1040
    for n in range(6):
        rr=5 if n!=idx else 8
        fill=(255,255,255,120) if n!=idx else (255,255,255,230)
        x=W//2+(n-2.5)*26
        d.ellipse((x-rr,dots_y-rr,x+rr,dots_y+rr),fill=fill)

    # subtle vignette last
    return vignette(img)

def synth(path,duration):
    sr=44100
    notes=[196,246.94,293.66,392,293.66,246.94]
    with wave.open(str(path),"w") as wf:
        wf.setnchannels(1);wf.setsampwidth(2);wf.setframerate(sr)
        frames=bytearray()
        for i in range(int(duration*sr)):
            t=i/sr;n=notes[int(t/2.5)%len(notes)]
            # softer pad + pulse, still original and license-free
            env=.65+.35*math.sin(2*math.pi*.12*t)
            v=(math.sin(2*math.pi*n*t)+.30*math.sin(2*math.pi*n*.5*t)+.22*math.sin(2*math.pi*n*1.5*t))*.034*env
            frames+=int(max(-1,min(1,v))*32767).to_bytes(2,"little",signed=True)
        wf.writeframes(frames)

def render(story):
    scenes=story.get("scenes") or []
    if len(scenes)<2:
        raise SystemExit("Need at least 2 scenes")
    SCENE_DIR.mkdir(exist_ok=True)
    per=TOTAL/len(scenes)
    pngs=[]
    for i,s in enumerate(scenes):
        p=SCENE_DIR/f"{i:02d}.png"
        scene_image(s,i,story.get("title","Animal Story")).save(p,quality=96)
        pngs.append(p)

    synth(AUDIO,TOTAL)
    cmd=["ffmpeg","-y"]
    for p in pngs:
        cmd += ["-loop","1","-t",f"{per:.3f}","-i",str(p)]
    cmd += ["-i",str(AUDIO)]

    filters=[]
    for i in range(len(pngs)):
        # Gentle Ken Burns motion. Odd/even scenes drift in opposite directions.
        pan = "iw/2-(iw/zoom/2)+8*sin(on/22)" if i%2==0 else "iw/2-(iw/zoom/2)-8*sin(on/22)"
        filters.append(
            f"[{i}:v]scale=780:1387,"
            f"zoompan=z='min(1.0+on*0.00035,1.045)':x='{pan}':y='ih/2-(ih/zoom/2)':"
            f"d=1:s={W}x{H}:fps={FPS},"
            f"fade=t=in:st=0:d=0.16,fade=t=out:st={max(0,per-.16):.3f}:d=0.16[v{i}]"
        )
    filters.append("".join(f"[v{i}]" for i in range(len(pngs)))+f"concat=n={len(pngs)}:v=1:a=0[v]")

    cmd += [
        "-filter_complex",";".join(filters),
        "-map","[v]","-map",f"{len(pngs)}:a",
        "-r",str(FPS),"-c:v","libx264","-preset","veryfast","-crf","21",
        "-pix_fmt","yuv420p","-c:a","aac","-b:a","128k",
        "-movflags","+faststart","-shortest",str(OUT)
    ]
    subprocess.run(cmd,check=True)

    META.write_text(json.dumps({
        "story_id":story.get("story_id","unknown"),
        "title":story.get("title","Animal Story")[:100],
        "description":story.get("description",""),
        "hashtags":story.get("hashtags",[]),
        "category_id":story.get("category_id","15"),
        "made_for_kids":bool(story.get("made_for_kids",False)),
        "synthetic_media":bool(story.get("synthetic_media",False))
    },ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"Rendered {OUT}")

if __name__=="__main__":
    render(json.loads(STORY.read_text(encoding="utf-8")))

#!/usr/bin/env python3
import json, math, os, random, subprocess, sys, wave
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H = 720, 1280
FPS = 24
DURATION = 30.0
ROOT = Path(__file__).resolve().parent
STORY = ROOT / "story.json"
OUT = ROOT / "output.mp4"
TMP_VIDEO = ROOT / "_video.mp4"
TMP_AUDIO = ROOT / "_audio.wav"
META = ROOT / "metadata.json"

FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
FONT_BOLD_CANDIDATES = [
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

def font(size, bold=False):
    for p in (FONT_BOLD_CANDIDATES if bold else FONT_CANDIDATES):
        if os.path.exists(p):
            return ImageFont.truetype(p, size=size)
    return ImageFont.load_default()

def wrap_text(text, fnt, max_width):
    words = text.split()
    if not words:
        return ""
    lines, cur = [], words[0]
    probe = Image.new("RGB", (10,10))
    d = ImageDraw.Draw(probe)
    for w in words[1:]:
        test = cur + " " + w
        if d.textbbox((0,0), test, font=fnt)[2] <= max_width:
            cur = test
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return "\n".join(lines[:4])

def gradient(top, bottom):
    img = Image.new("RGB",(W,H))
    px = img.load()
    for y in range(H):
        t = y/(H-1)
        c = tuple(int(top[i]*(1-t)+bottom[i]*t) for i in range(3))
        for x in range(W):
            px[x,y] = c
    return img

def background(kind, seed):
    rng = random.Random(seed)
    palettes = {
        "rain":((35,45,65),(85,100,125)),
        "street":((72,86,105),(165,175,185)),
        "park":((135,195,235),(220,245,225)),
        "home":((235,218,190),(250,242,225)),
        "sunset":((255,168,120),(112,92,162)),
        "night":((20,28,52),(55,64,92))
    }
    top,bottom = palettes.get(kind, palettes["park"])
    img = gradient(top,bottom)
    d = ImageDraw.Draw(img)
    if kind in ("park","sunset"):
        d.rectangle((0,int(H*0.62),W,H), fill=(78,145,85))
        for tx in (100,580):
            d.rectangle((tx-15,int(H*.42),tx+15,int(H*.68)), fill=(105,75,52))
            d.ellipse((tx-80,int(H*.33),tx+80,int(H*.52)), fill=(75,145,78))
    elif kind == "home":
        d.rectangle((0,int(H*.62),W,H), fill=(178,138,105))
        d.rectangle((55,120,310,430), fill=(156,205,235), outline=(255,255,255), width=10)
        d.line((182,120,182,430), fill=(255,255,255), width=8)
        d.line((55,275,310,275), fill=(255,255,255), width=8)
        d.rounded_rectangle((430,160,650,520), radius=16, fill=(185,130,80))
    elif kind == "street":
        d.rectangle((0,int(H*.62),W,H), fill=(70,72,78))
        for y in (800,1030):
            d.rectangle((80,y,W-80,y+18), fill=(225,205,120))
        d.rounded_rectangle((90,560,360,700), radius=18, fill=(92,64,42))
    elif kind == "rain":
        d.rectangle((0,int(H*.65),W,H), fill=(62,68,78))
        for _ in range(70):
            x=rng.randint(0,W); y=rng.randint(0,H)
            d.line((x,y,x-8,y+28), fill=(190,215,235), width=2)
    elif kind == "night":
        d.rectangle((0,int(H*.68),W,H), fill=(45,55,58))
        for _ in range(45):
            x=rng.randint(0,W); y=rng.randint(0,int(H*.55))
            r=rng.choice([1,2,3])
            d.ellipse((x-r,y-r,x+r,y+r), fill=(240,240,210))
    return img

def face(draw, cx, cy, r, emotion):
    eye_y = cy-int(r*.12)
    er = max(3,int(r*.07))
    draw.ellipse((cx-int(r*.34)-er,eye_y-er,cx-int(r*.34)+er,eye_y+er), fill=(25,25,25))
    draw.ellipse((cx+int(r*.34)-er,eye_y-er,cx+int(r*.34)+er,eye_y+er), fill=(25,25,25))
    if emotion in ("sad","hopeful"):
        draw.arc((cx-int(r*.35),cy+int(r*.10),cx+int(r*.35),cy+int(r*.45)), 200,340, fill=(40,40,40), width=max(2,int(r*.04)))
    elif emotion=="surprised":
        rr=max(5,int(r*.11)); draw.ellipse((cx-rr,cy+int(r*.16)-rr,cx+rr,cy+int(r*.16)+rr), outline=(40,40,40), width=max(2,int(r*.04)))
    else:
        draw.arc((cx-int(r*.35),cy, cx+int(r*.35),cy+int(r*.38)), 15,165, fill=(40,40,40), width=max(2,int(r*.04)))

def dog(draw, x, y, s, emotion):
    cx,cy=int(W*x),int(H*y); r=int(82*s)
    body=(cx-int(86*s),cy+int(45*s),cx+int(86*s),cy+int(185*s))
    draw.ellipse(body, fill=(198,142,83), outline=(100,70,45), width=max(2,int(5*s)))
    draw.ellipse((cx-r,cy-r,cx+r,cy+r), fill=(218,164,99), outline=(100,70,45), width=max(2,int(5*s)))
    draw.polygon([(cx-r+8,cy-r+18),(cx-r-int(50*s),cy-int(35*s)),(cx-int(35*s),cy+int(15*s))], fill=(150,95,55))
    draw.polygon([(cx+r-8,cy-r+18),(cx+r+int(50*s),cy-int(35*s)),(cx+int(35*s),cy+int(15*s))], fill=(150,95,55))
    draw.ellipse((cx-int(22*s),cy+int(12*s),cx+int(22*s),cy+int(42*s)), fill=(40,35,30))
    face(draw,cx,cy,r,emotion)
    draw.arc((cx+int(70*s),cy+int(75*s),cx+int(145*s),cy+int(165*s)), 250,80, fill=(120,75,45), width=max(3,int(9*s)))

def cat(draw, x, y, s, emotion):
    cx,cy=int(W*x),int(H*y); r=int(70*s)
    draw.ellipse((cx-int(72*s),cy+int(38*s),cx+int(72*s),cy+int(160*s)), fill=(145,150,158), outline=(70,72,78), width=max(2,int(4*s)))
    draw.ellipse((cx-r,cy-r,cx+r,cy+r), fill=(170,175,182), outline=(70,72,78), width=max(2,int(4*s)))
    draw.polygon([(cx-r+10,cy-r+20),(cx-int(45*s),cy-r-int(52*s)),(cx-int(10*s),cy-r+8)], fill=(155,160,168))
    draw.polygon([(cx+r-10,cy-r+20),(cx+int(45*s),cy-r-int(52*s)),(cx+int(10*s),cy-r+8)], fill=(155,160,168))
    draw.ellipse((cx-int(14*s),cy+int(12*s),cx+int(14*s),cy+int(30*s)), fill=(65,65,70))
    face(draw,cx,cy,r,emotion)
    draw.arc((cx+int(55*s),cy+int(55*s),cx+int(145*s),cy+int(175*s)), 230,70, fill=(90,92,98), width=max(3,int(8*s)))

def make_scene(scene, idx, title):
    img = background(scene.get("background","park"), idx*7919+17)
    d = ImageDraw.Draw(img)
    for a in scene.get("actors",[]):
        fn = dog if a.get("type")=="dog" else cat
        fn(d, float(a.get("x",.5)), float(a.get("y",.66)), float(a.get("scale",1)), a.get("emotion","calm"))
    if idx == 0:
        tf=font(54,True)
        txt=wrap_text(title,tf,W-90)
        box=d.multiline_textbbox((0,0),txt,font=tf,spacing=8,align="center")
        tw=box[2]-box[0]
        d.multiline_text(((W-tw)//2,70),txt,font=tf,fill=(255,255,255),spacing=8,align="center",stroke_width=3,stroke_fill=(0,0,0))
    cap = str(scene.get("caption","")).strip()
    cf=font(48,True)
    txt=wrap_text(cap,cf,W-120)
    bbox=d.multiline_textbbox((0,0),txt,font=cf,spacing=10,align="center")
    th=bbox[3]-bbox[1]
    y0=H-th-150
    d.rounded_rectangle((45,y0-35,W-45,H-65), radius=28, fill=(0,0,0,190))
    d.multiline_text((W//2,y0),txt,font=cf,fill=(255,255,255),anchor="ma",align="center",spacing=10,stroke_width=2,stroke_fill=(0,0,0))
    return img

def synth_audio(path, duration):
    sr=44100
    notes=[220.0,277.18,329.63,392.0,329.63,277.18]
    with wave.open(str(path),"w") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr)
        for i in range(int(duration*sr)):
            t=i/sr
            n=notes[int(t/2.5)%len(notes)]
            env=0.5*(1-math.cos(min(1,(t%2.5)/.25)*math.pi)) if (t%2.5)<.25 else 1
            val=(math.sin(2*math.pi*n*t)+0.45*math.sin(2*math.pi*(n*1.5)*t))*0.055*env
            wf.writeframesraw(int(max(-1,min(1,val))*32767).to_bytes(2,"little",signed=True))

def render(story):
    scenes=story.get("scenes") or []
    if not scenes: raise SystemExit("story.json has no scenes")
    scene_imgs=[make_scene(s,i,story.get("title","Animal Story")) for i,s in enumerate(scenes)]
    per=DURATION/len(scene_imgs)
    cmd=["ffmpeg","-y","-f","rawvideo","-vcodec","rawvideo","-pix_fmt","rgb24","-s",f"{W}x{H}","-r",str(FPS),"-i","-","-an","-c:v","libx264","-preset","veryfast","-crf","22","-pix_fmt","yuv420p",str(TMP_VIDEO)]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    total=int(DURATION*FPS)
    for fi in range(total):
        t=fi/FPS
        si=min(len(scene_imgs)-1,int(t/per))
        local=(t-si*per)/per
        base=scene_imgs[si]
        scale=1.0+0.035*local
        rw,rh=int(W*scale),int(H*scale)
        z=base.resize((rw,rh),Image.Resampling.LANCZOS)
        ox=max(0,(rw-W)//2+int(math.sin(local*math.pi*2)*7))
        oy=max(0,(rh-H)//2+int(math.sin(local*math.pi)*5))
        fr=z.crop((ox,oy,ox+W,oy+H))
        p.stdin.write(fr.tobytes())
    p.stdin.close()
    if p.wait()!=0: raise SystemExit("ffmpeg video render failed")
    synth_audio(TMP_AUDIO,DURATION)
    subprocess.run(["ffmpeg","-y","-i",str(TMP_VIDEO),"-i",str(TMP_AUDIO),"-c:v","copy","-c:a","aac","-b:a","128k","-shortest",str(OUT)],check=True)
    meta={
        "story_id":story.get("story_id","unknown"),
        "title":story.get("title","Animal Story")[:100],
        "description":story.get("description",""),
        "hashtags":story.get("hashtags",[]),
        "category_id":story.get("category_id","15"),
        "made_for_kids":bool(story.get("made_for_kids",False)),
        "synthetic_media":bool(story.get("synthetic_media",False)),
        "file":str(OUT)
    }
    META.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"Rendered {OUT}")

if __name__=="__main__":
    story=json.loads(STORY.read_text(encoding="utf-8"))
    render(story)

#!/usr/bin/env python3
import json, math, os, random, shutil, subprocess, wave
from pathlib import Path
from gradio_client import Client

ROOT = Path(__file__).resolve().parent
STORY = ROOT / "story.json"
OUT = ROOT / "output.mp4"
META = ROOT / "metadata.json"
AUDIO = ROOT / "_audio.wav"
CLIP_DIR = ROOT / "_clips"
READY = ROOT / "READY_TO_UPLOAD"

HF_SPACE = os.environ.get("HF_SPACE", "alexcheng0072/wan27-free-video-generator")
HF_TOKEN = os.environ.get("HF_TOKEN", "").strip()

ACTORS = {
    "dog": "a lovable small golden-brown dog with expressive dark eyes and natural fur",
    "cat": "a charming silver-gray cat with expressive green eyes and realistic soft fur",
    "rabbit": "a small white-gray rabbit with long ears and expressive dark eyes",
    "fox": "a young red fox with a cream chest, bright amber eyes and a fluffy tail",
    "bear": "a small brown bear with warm expressive eyes and realistic soft fur",
    "penguin": "a small black-and-white penguin with expressive eyes and natural feathers",
    "deer": "a young brown deer with gentle dark eyes and delicate natural fur",
    "raccoon": "a small silver-gray raccoon with a black face mask, ringed tail and expressive amber eyes",
}

BACKGROUNDS = {
    "rain": "rainy city lane at night with wet reflections",
    "street": "cinematic quiet neighborhood street with depth",
    "park": "lush city park with trees and natural daylight",
    "home": "warm cozy home interior with practical lamps",
    "sunset": "outdoor golden sunset with dramatic warm backlight",
    "night": "moonlit outdoor night scene with cinematic lighting",
}


def run(cmd):
    subprocess.run(cmd, check=True)


def actor_description(actor):
    kind = str(actor.get("type", "dog")).lower()
    base = ACTORS.get(kind, ACTORS["dog"])
    emotion = str(actor.get("emotion", "surprised")).lower()
    return f"{base}, visibly {emotion}"


def build_one_shot_prompt(story):
    scenes = story.get("scenes") or []
    first = scenes[0]
    actors = first.get("actors") or [{"type": "dog", "emotion": "surprised"}]
    actor_text = "; ".join(actor_description(a) for a in actors[:2])
    bg = BACKGROUNDS.get(str(first.get("background", "park")).lower(), BACKGROUNDS["park"])
    beats = [str(s.get("caption", "")).strip() for s in scenes[:3] if str(s.get("caption", "")).strip()]
    beat_text = " then ".join(beats)
    prompt = (
        f"Vertical 9:16 cinematic 2-second video, {bg}. {actor_text}. "
        f"One continuous fast visual action: {beat_text}. "
        f"Strong body motion and facial reaction, immediate action in first frame, handheld push-in, "
        f"clear subject, realistic lighting, dynamic movement, loop-friendly ending. "
        f"No text, subtitles, logo or watermark."
    )
    return prompt[:580]


def extract_video_path(result):
    value = result[0] if isinstance(result, (tuple, list)) else result
    if isinstance(value, str):
        return Path(value)
    if isinstance(value, dict):
        for key in ("path", "video", "name"):
            v = value.get(key)
            if isinstance(v, str):
                return Path(v)
            if isinstance(v, dict) and isinstance(v.get("path"), str):
                return Path(v["path"])
    raise RuntimeError(f"Unsupported video result: {type(value)!r}")


def generate_one_clip(client, story):
    prompt = build_one_shot_prompt(story)
    print("Generating one AI motion clip for anonymous $0 mode...")
    result = client.predict(None, prompt, "480x832", 2, api_name="/generate_video")
    src = extract_video_path(result)
    if not src.exists():
        raise RuntimeError(f"Generated clip not found: {src}")
    dst = CLIP_DIR / "raw.mp4"
    shutil.copy2(src, dst)
    return dst


def ffmpeg_text_path(path):
    return str(path.resolve()).replace("\\", "\\\\").replace(":", "\\:")


def write_caption_files(story):
    scenes = story.get("scenes") or []
    captions = [str(s.get("caption", "")).strip() for s in scenes[:3]]
    while len(captions) < 3:
        captions.append(captions[-1] if captions else "")
    files = []
    for i, cap in enumerate(captions):
        p = CLIP_DIR / f"caption_{i}.txt"
        p.write_text(cap, encoding="utf-8")
        files.append(p)
    return files


def remix_to_short(src, story):
    caps = write_caption_files(story)
    silent = CLIP_DIR / "silent.mp4"

    # 2s original -> 2s close replay -> 2s reverse loop.
    vf = (
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,trim=start=0:end=2,setpts=PTS-STARTPTS[v0];"
        "[0:v]scale=1240:2204:force_original_aspect_ratio=increase,"
        "crop=1080:1920,trim=start=0.25:end=1.75,setpts=1.333333*(PTS-STARTPTS)[v1];"
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,trim=start=0:end=2,reverse,setpts=PTS-STARTPTS[v2];"
        "[v0][v1][v2]concat=n=3:v=1:a=0[base];"
        f"[base]"
        f"drawtext=textfile='{ffmpeg_text_path(caps[0])}':font='DejaVu Sans':fontcolor=white:fontsize=62:"
        "borderw=6:bordercolor=black@0.85:x=(w-text_w)/2:y=h*0.76:enable='between(t,0,1.95)',"
        f"drawtext=textfile='{ffmpeg_text_path(caps[1])}':font='DejaVu Sans':fontcolor=white:fontsize=62:"
        "borderw=6:bordercolor=black@0.85:x=(w-text_w)/2:y=h*0.76:enable='between(t,2,3.95)',"
        f"drawtext=textfile='{ffmpeg_text_path(caps[2])}':font='DejaVu Sans':fontcolor=white:fontsize=62:"
        "borderw=6:bordercolor=black@0.85:x=(w-text_w)/2:y=h*0.76:enable='between(t,4,5.95)',"
        "format=yuv420p[v]"
    )

    run([
        "ffmpeg", "-y", "-i", str(src),
        "-filter_complex", vf,
        "-map", "[v]", "-an", "-r", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-movflags", "+faststart", str(silent)
    ])
    return silent


def synth_audio(path, duration=6.0):
    sr = 44100
    rng = random.Random(927)
    hits = (0.0, 2.0, 4.0)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        frames = bytearray()
        for i in range(int(duration * sr)):
            t = i / sr
            v = 0.014 * math.sin(2 * math.pi * 110 * t)
            v += 0.008 * math.sin(2 * math.pi * 165 * t)
            for mark in hits:
                dt = t - mark
                if 0 <= dt < 0.18:
                    env = math.exp(-19 * dt)
                    v += env * (0.055 * math.sin(2 * math.pi * (310 - 700 * dt) * dt))
                    v += env * 0.018 * (rng.random() * 2 - 1)
            v = max(-0.9, min(0.9, v))
            frames += int(v * 32767).to_bytes(2, "little", signed=True)
        wf.writeframes(frames)


def mux(video):
    run([
        "ffmpeg", "-y", "-i", str(video), "-i", str(AUDIO),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
        "-shortest", "-movflags", "+faststart", str(OUT)
    ])


def write_metadata(story):
    META.write_text(json.dumps({
        "story_id": story.get("story_id", "unknown"),
        "title": str(story.get("title", "AI Short"))[:100],
        "description": story.get("description", ""),
        "hashtags": story.get("hashtags", []),
        "category_id": str(story.get("category_id", "15")),
        "made_for_kids": bool(story.get("made_for_kids", False)),
        "synthetic_media": bool(story.get("synthetic_media", False)),
        "content_format": story.get("content_format", "oddly_satisfying_story"),
        "duration_seconds": 6,
        "render_engine": "hf_zerogpu_one_clip_remix",
        "hf_space": HF_SPACE
    }, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    READY.unlink(missing_ok=True)
    OUT.unlink(missing_ok=True)

    story = json.loads(STORY.read_text(encoding="utf-8"))
    scenes = story.get("scenes") or []
    if len(scenes) < 3:
        raise SystemExit("story.json must contain at least 3 scenes")

    # HIGH_QUALITY_STORY_GUARD
    # The free one-clip renderer is only allowed for intentionally short 6s stories.
    # Never compress a 30-50s / multi-scene high-quality story into a cheap 2s remix.
    requested_duration = float(story.get("duration_seconds", 6))
    if requested_duration > 6 or len(scenes) > 3:
        print(
            f"High-quality story detected ({requested_duration}s, {len(scenes)} scenes). "
            "Free one-clip fallback is intentionally disabled; skipping render/upload."
        )
        return

    if CLIP_DIR.exists():
        shutil.rmtree(CLIP_DIR)
    CLIP_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Using free ZeroGPU Space: {HF_SPACE}")
    print(f"Mode: {'anonymous $0 / one AI generation' if not HF_TOKEN else 'signed-in free quota'}")
    client = Client(HF_SPACE, token=HF_TOKEN or None)

    raw = generate_one_clip(client, story)
    silent = remix_to_short(raw, story)
    synth_audio(AUDIO, 6.0)
    mux(silent)
    write_metadata(story)

    READY.write_text("ok\n", encoding="utf-8")
    print(f"Rendered dynamic AI Short: {OUT} (6s)")


if __name__ == "__main__":
    main()

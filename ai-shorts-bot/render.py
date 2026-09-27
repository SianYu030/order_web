#!/usr/bin/env python3
import json
import math
import os
import random
import shutil
import subprocess
import wave
from pathlib import Path

from gradio_client import Client

ROOT = Path(__file__).resolve().parent
STORY = ROOT / "story.json"
OUT = ROOT / "output.mp4"
META = ROOT / "metadata.json"
AUDIO = ROOT / "_audio.wav"
CLIP_DIR = ROOT / "_clips"
READY = ROOT / "READY_TO_UPLOAD"

HF_SPACE = os.environ.get(
    "HF_SPACE",
    "alexcheng0072/wan27-free-video-generator",
)
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
    "rain": "a rainy city lane at night, wet pavement reflections, visible falling rain",
    "street": "a cinematic quiet neighborhood street with depth and practical lights",
    "park": "a lush city park with natural depth, trees and soft daylight",
    "home": "a warm cozy home interior with practical lamps and believable detail",
    "sunset": "an outdoor setting during golden sunset with dramatic warm backlight",
    "night": "a moonlit outdoor night scene with cinematic practical lighting",
}

CAMERAS = [
    "handheld tracking shot rushing toward the subject",
    "low-angle follow shot with a quick push-in",
    "close tracking shot, slight camera shake, rack focus",
    "fast dolly-in followed by an emotional close-up",
    "side tracking shot with parallax and a quick reaction close-up",
    "tight cinematic close-up that resolves into a wider reveal",
]


def run(cmd):
    subprocess.run(cmd, check=True)


def actor_description(actor):
    kind = str(actor.get("type", "dog")).lower()
    base = ACTORS.get(kind, ACTORS["dog"])
    emotion = str(actor.get("emotion", "calm")).lower()
    return f"{base}, visibly {emotion}"


def build_prompt(scene, index, total):
    actors = scene.get("actors") or [{"type": "dog", "emotion": "surprised"}]
    actor_text = "; ".join(actor_description(a) for a in actors[:3])
    bg = BACKGROUNDS.get(str(scene.get("background", "park")).lower(), BACKGROUNDS["park"])
    beat = str(scene.get("caption", "")).strip()
    camera = CAMERAS[index % len(CAMERAS)]

    return (
        f"Vertical 9:16 cinematic short-form video. {bg}. "
        f"Main subject: {actor_text}. "
        f"Story beat: {beat}. "
        f"The characters must physically ACT out the story beat with clear body movement and facial reaction; "
        f"do not pose or stand still. {camera}. "
        f"Strong foreground/background separation, realistic lighting, detailed environment, dynamic motion, "
        f"clear visual storytelling that works without narration. "
        f"Shot {index + 1} of {total}. No written text, no subtitles, no logo, no watermark."
    )


def extract_video_path(result):
    value = result[0] if isinstance(result, (tuple, list)) else result

    if isinstance(value, str):
        return Path(value)

    if isinstance(value, dict):
        for key in ("path", "video", "name"):
            candidate = value.get(key)
            if isinstance(candidate, str):
                return Path(candidate)
            if isinstance(candidate, dict) and isinstance(candidate.get("path"), str):
                return Path(candidate["path"])

    raise RuntimeError(f"Unsupported video result type: {type(value)!r}")


def generate_clip(client, scene, index, total, seconds):
    prompt = build_prompt(scene, index, total)
    print(f"Generating AI clip {index + 1}/{total} ({seconds}s)...")
    result = client.predict(
        None,
        prompt,
        "480x832",
        int(seconds),
        api_name="/generate_video",
    )
    src = extract_video_path(result)
    if not src.exists():
        raise RuntimeError(f"Generated clip not found: {src}")

    dst = CLIP_DIR / f"raw_{index:02d}.mp4"
    shutil.copy2(src, dst)
    return dst


def escape_drawtext_path(path):
    return str(path).replace("\\", "\\\\").replace(":", "\\:")


def stylize_clip(src, caption, index):
    text_file = CLIP_DIR / f"caption_{index:02d}.txt"
    text_file.write_text(str(caption).strip(), encoding="utf-8")
    dst = CLIP_DIR / f"edit_{index:02d}.mp4"

    draw = (
        "drawtext="
        f"textfile='{escape_drawtext_path(text_file)}':"
        "font='DejaVu Sans':"
        "fontcolor=white:fontsize=58:"
        "borderw=5:bordercolor=black@0.85:"
        "line_spacing=10:"
        "x=(w-text_w)/2:"
        "y=h*0.76"
    )

    vf = (
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,"
        f"{draw},"
        "format=yuv420p"
    )

    run([
        "ffmpeg", "-y", "-i", str(src),
        "-vf", vf,
        "-an",
        "-r", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-movflags", "+faststart",
        str(dst),
    ])
    return dst


def concat_clips(clips):
    list_file = CLIP_DIR / "concat.txt"
    list_file.write_text(
        "".join(f"file '{p.resolve()}'\n" for p in clips),
        encoding="utf-8",
    )
    silent = CLIP_DIR / "silent.mp4"
    run([
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c", "copy",
        str(silent),
    ])
    return silent


def duration_of(path):
    out = subprocess.check_output([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path),
    ], text=True).strip()
    return max(0.1, float(out))


def synth_audio(path, duration, scene_count):
    sr = 44100
    rng = random.Random(20260927)
    transitions = [
        duration * i / max(1, scene_count)
        for i in range(1, scene_count)
    ]

    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)

        frames = bytearray()
        for i in range(int(duration * sr)):
            t = i / sr

            # Minimal cinematic pulse bed.
            pulse = 0.018 * math.sin(2 * math.pi * 110 * t)
            pulse += 0.010 * math.sin(2 * math.pi * 164.81 * t)
            pulse *= 0.55 + 0.45 * (0.5 + 0.5 * math.sin(2 * math.pi * 1.8 * t))

            # Short transition impacts generated locally; no copyrighted audio.
            impact = 0.0
            for mark in transitions:
                dt = t - mark
                if 0 <= dt < 0.16:
                    env = math.exp(-18 * dt)
                    impact += env * (
                        0.06 * math.sin(2 * math.pi * (240 - 900 * dt) * dt)
                        + 0.025 * (rng.random() * 2 - 1)
                    )

            # Tiny opening hook hit.
            if t < 0.12:
                pulse += 0.06 * math.exp(-24 * t) * math.sin(2 * math.pi * 330 * t)

            v = max(-0.95, min(0.95, pulse + impact))
            frames += int(v * 32767).to_bytes(2, "little", signed=True)

        wf.writeframes(frames)


def mux_audio(video, audio):
    run([
        "ffmpeg", "-y",
        "-i", str(video), "-i", str(audio),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "160k",
        "-shortest",
        "-movflags", "+faststart",
        str(OUT),
    ])


def write_metadata(story, actual_duration):
    META.write_text(json.dumps({
        "story_id": story.get("story_id", "unknown"),
        "title": str(story.get("title", "AI Short"))[:100],
        "description": story.get("description", ""),
        "hashtags": story.get("hashtags", []),
        "category_id": str(story.get("category_id", "15")),
        "made_for_kids": bool(story.get("made_for_kids", False)),
        "synthetic_media": bool(story.get("synthetic_media", False)),
        "content_format": story.get("content_format", "suspense_reveal"),
        "duration_seconds": round(actual_duration, 2),
        "render_engine": "hf_zerogpu_wan_t2v",
        "hf_space": HF_SPACE,
    }, ensure_ascii=False, indent=2), encoding="utf-8")


def main():
    READY.unlink(missing_ok=True)
    OUT.unlink(missing_ok=True)

    story = json.loads(STORY.read_text(encoding="utf-8"))
    scenes = story.get("scenes") or []
    if not 3 <= len(scenes) <= 6:
        raise SystemExit("story.json must contain 3-6 scenes")

    # Fully hands-off $0 mode:
    # Hugging Face currently gives unauthenticated ZeroGPU visitors about 2 minutes/day.
    # To stay inside that budget, anonymous runs use only the first 3 scenes at 2 seconds each.
    # If HF_TOKEN is added later, the signed-in free quota is larger and 3-6 scenes can be used.
    anonymous_mode = not HF_TOKEN
    if anonymous_mode:
        scenes = scenes[:3]
        clip_seconds = 2
    else:
        target = float(story.get("duration_seconds", 10))
        clip_seconds = max(2, min(3, round(target / len(scenes))))

    if CLIP_DIR.exists():
        shutil.rmtree(CLIP_DIR)
    CLIP_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Using free ZeroGPU Space: {HF_SPACE}")
    print(f"Mode: {'anonymous $0' if anonymous_mode else 'signed-in free quota'}")
    print(f"Scenes: {len(scenes)} | AI seconds per scene: {clip_seconds}")
    client = Client(HF_SPACE, token=HF_TOKEN or None)

    raw = []
    for i, scene in enumerate(scenes):
        raw.append(generate_clip(client, scene, i, len(scenes), clip_seconds))

    edited = []
    for i, (src, scene) in enumerate(zip(raw, scenes)):
        edited.append(stylize_clip(src, scene.get("caption", ""), i))

    silent = concat_clips(edited)
    total = duration_of(silent)
    synth_audio(AUDIO, total, len(scenes))
    mux_audio(silent, AUDIO)
    write_metadata(story, total)

    READY.write_text("ok\n", encoding="utf-8")
    print(f"Rendered dynamic AI Short: {OUT} ({total:.1f}s)")


if __name__ == "__main__":
    main()

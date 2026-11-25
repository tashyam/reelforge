#!/usr/bin/env python3
"""AI Video Factory: one 30 s vertical 3D cartoon "fake origin story" Short, end to end.

  topic -> Groq (story JSON) -> voice (edge-tts -> Kokoro -> gTTS) -> 3d-video-studio render -> mux -> Telegram

Usage:  python factory.py "Why receipts exist"      (or "auto" to pick a topic)
Flags:  --story file.json     use this story JSON instead of calling Groq
        --stills 5,12,20      render only these stills (seconds) into <proj>/stills and stop
        --skip-telegram       do not send to Telegram
Env:    GROQ_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
"""
import argparse, json, os, random, re, shutil, subprocess, sys, time, wave
import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
STUDIO = os.path.join(ROOT, "3d-video-studio")
ENGINE = os.path.join(STUDIO, "engine")
PIPE = os.path.join(ROOT, "pipeline")
PROJ = os.path.join(STUDIO, "project_out")
MODELS = os.path.join(ROOT, "models")
DURATION = 30.0
FPS = 30
SR = 24000
GAP = 0.18

GROQ_KEY = os.environ.get("GROQ_API_KEY", "").strip()
TG_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "").strip()

TOPICS = [
    "Why shops give you a receipt", "Why ATMs have a camera", "Why hotels use key cards",
    "Why you sign for parcels", "Why shop doors beep when you leave", "Why supermarkets weigh your bag",
    "Why packages have tamper seals", "Why restaurants photograph your food", "Why banks check your signature",
    "Why gas stations make you pay first", "Why delivery drivers take doorstep photos",
    "Why parking lots have yellow speed bumps", "Why stores put black stripes on every box",
]
PLACES = ["shop", "office", "kitchen", "living", "empty"]
HEROES = ["camBox", "laptop", "paper", "deskPhone", "parcel", "mailbox", "screen"]

# the hand-built dashcam story (used when the topic is about filming the road)
DASHCAM_STORY = {
    "title": "Why Drivers Started Filming The Road",
    "hashtags": "#shorts #animation #history #didyouknow",
    "sentences": [
        "Long ago, a sly driver named Rex found a clever trick.",
        "He slammed his brakes on empty roads, and the car behind always crashed.",
        "Then he blamed them, and collected easy money.",
        "Again and again, Rex got rich from other people's bad luck.",
        "Until one quiet driver, Sam, stuck a tiny camera on his window.",
        "Rex braked, Sam crashed, and the camera caught everything.",
        "The judge watched the video, and Rex paid the bill.",
        "And that's how the dashcam was invented.",
    ],
    "kit": "dashcam",
}


# used only if Groq fails, so a run still ends with a video (the caption says so)
FALLBACK_STORY = {
    "title": "Why Shops Give You A Little Slip Of Paper",
    "hashtags": "#shorts #animation #didyouknow #funny #history",
    "sentences": [
        "Long ago, a sly shopper named Rex bought a snack, then screamed that the shop had cheated him.",
        "He swore he paid with a huge bill, because nobody could prove what he handed over.",
        "The shopkeeper panicked and paid him back double, plus a free chocolate.",
        "So Rex did it every single day, until he owned a mountain of other people's money.",
        "Then one quiet shopper, Sam, bought a candy and calmly took a tiny slip of paper.",
        "Rex yelled again, but the little slip showed the exact price, the time, and the change.",
        "The judge read it twice, and Rex had to pay everything back.",
        "And that's how the receipt was invented."
    ],
    "place": "shop",
    "placeSign": "CORNER SHOP",
    "schemeText": [
        "NO PROOF",
        "NO PROBLEM"
    ],
    "hero": "paper",
    "invention": "RECEIPT",
    "viewTitle": "RECEIPT",
    "viewLines": [
        "TOTAL $4.50",
        "PAID IN FULL",
        "LIAR CAUGHT"
    ],
    "kit": "generic"
}


def log(*a):
    print(*a, flush=True)


def run(cmd, **kw):
    log("$", " ".join(str(c) for c in cmd))
    return subprocess.run(cmd, check=True, **kw)


# ============================================================ text helpers
def clean_text(s):
    s = (s or "").replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("—", " ").replace("–", " ").replace("…", "...")
    s = re.sub(r"[^A-Za-z0-9 .,!?'$%&-]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def short_caps(s, n, default):
    s = re.sub(r"[^A-Z0-9 $%&!?.'-]", "", clean_text(s).upper()).strip()
    return s[:n].strip() or default


# ============================================================ Groq
def groq_models(headers):
    preferred = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "openai/gpt-oss-20b",
                 "meta-llama/llama-4-scout-17b-16e-instruct", "qwen/qwen3-32b", "llama-3.1-8b-instant"]
    try:
        r = requests.get("https://api.groq.com/openai/v1/models", headers=headers, timeout=30)
        avail = [m["id"] for m in r.json().get("data", [])]
        skip = ("whisper", "tts", "guard", "embed", "orpheus", "playai", "safeguard")
        extra = [m for m in avail if m not in preferred and not any(x in m.lower() for x in skip)]
        order = [m for m in preferred if m in avail] + extra
        return order or preferred
    except Exception as e:
        log("could not list Groq models:", e)
        return preferred


def groq_chat(prompt):
    if not GROQ_KEY:
        raise RuntimeError("GROQ_API_KEY is empty")
    headers = {"Authorization": f"Bearer {GROQ_KEY}", "Content-Type": "application/json",
               "User-Agent": "Mozilla/5.0 (compatible; VideoFactory/2.0)"}
    last = ""
    for model in groq_models(headers):
        for attempt in range(2):
            log(f"Groq model {model} (attempt {attempt + 1})")
            try:
                r = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, timeout=90,
                                  json={"model": model, "temperature": 0.8, "max_tokens": 3000,
                                        "messages": [{"role": "user", "content": prompt}]})
            except Exception as e:
                last = f"{model}: {e}"
                break
            if r.ok:
                content = (r.json()["choices"][0]["message"].get("content") or "").strip()
                if "</think>" in content:
                    content = content.split("</think>", 1)[1].strip()
                if content:
                    return content
                last = f"{model}: empty"
                break
            last = f"{model}: {r.status_code} {r.text[:150]}"
            log("skip:", last)
            if r.status_code == 429 and attempt == 0:
                time.sleep(6)
                continue
            break
    raise RuntimeError("all Groq models failed: " + last)


def story_prompt(topic):
    return f"""You write 30-second funny YouTube Shorts: a FAKE comic origin story for an everyday invention.
Topic: "{topic}"

Story formula: a bold SCHEMER (the hero we want to see caught) exploits a loophole, gets rich, gets greedy, and is beaten by a QUIET victim who just uses the INVENTION. The last sentence names it.

Return ONLY one JSON object (no markdown) with exactly these keys:
{{
 "title": "curiosity-gap YouTube Shorts title, max 70 chars, does NOT name the invention",
 "hashtags": "5 viral hashtags separated by spaces, starting with #shorts",
 "sentences": [exactly 8 strings, see beats],
 "place": one of {PLACES}  (the room where the scheme happens: shop, office, kitchen, living, or empty),
 "placeSign": "sign above the counter, max 12 letters, uppercase",
 "schemeText": ["1 or 2 short uppercase lines, max 12 chars each: the loophole he exploits, written like a sign"],
 "hero": one of {HEROES}  (the object that looks most like the invention),
 "invention": "the invention, uppercase, max 12 chars",
 "viewTitle": "what the invention records or prints, uppercase, max 16 chars",
 "viewLines": [exactly 3 short uppercase lines, max 20 chars each: what the invention shows, the last line is the damning one]
}}

The 8 sentences, one per beat, total 78 to 90 words, each 8 to 16 words:
1 HOOK: past tense, the schemer does something bold and a person suffers the result.
2 LOOPHOLE: the fake-out plus the rule he figured he could exploit.
3 PAYOFF: it works; the funniest reward comes last.
4 GREED: he repeats it again and again and gets absurdly rich.
5 QUIET VICTIM: one quiet, ordinary person does the same trick on them but calmly uses a humble object (do not name the invention yet, call it a little thing).
6 REVEAL OF THE VIEW: the schemer tries it, the little thing shows exactly what really happened.
7 JUSTICE: an authority looks at it and the schemer pays everything back.
8 TAG: exactly: And that's how the <invention> was invented.

Style: short everyday words, deadpan, specific small details, forward-driving openers (He, Then, So, Until, But). Real-world cartoonish scheme only, no step-by-step fraud, no real companies or people. No quotes, emojis, dashes or semicolons inside sentences."""


def parse_story(raw, topic):
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        raise ValueError("no JSON in Groq reply")
    d = json.loads(m.group(0))
    sents = [clean_text(s) for s in d.get("sentences", []) if clean_text(s)]
    if not (7 <= len(sents) <= 9):
        raise ValueError(f"need 8 sentences, got {len(sents)}")
    words = sum(len(s.split()) for s in sents)
    if not (60 <= words <= 105):
        raise ValueError(f"script has {words} words, need 60-105")
    inv = short_caps(d.get("invention", ""), 12, "INVENTION")
    hero = d.get("hero") if d.get("hero") in HEROES else "camBox"
    place = d.get("place") if d.get("place") in PLACES else "shop"
    scheme = d.get("schemeText") or ["NO PROOF"]
    if isinstance(scheme, str):
        scheme = [scheme]
    vl = d.get("viewLines") or ["RECORDED", "EVERYTHING", "BUSTED"]
    if isinstance(vl, str):
        vl = [vl]
    vl = [short_caps(x, 20, "RECORDED") for x in vl][:3]
    while len(vl) < 3:
        vl.append("CASE CLOSED")
    tags = " ".join(h if h.startswith("#") else "#" + h for h in re.split(r"[\s,]+", str(d.get("hashtags", "")).strip()) if h)
    if "#shorts" not in tags.lower():
        tags = "#shorts " + tags
    return {
        "title": clean_text(d.get("title", "")) [:90] or topic,
        "hashtags": tags.strip(),
        "sentences": sents,
        "place": place,
        "placeSign": short_caps(d.get("placeSign", ""), 12, "SHOP"),
        "schemeText": [short_caps(x, 12, "NO PROOF") for x in scheme][:2],
        "hero": hero,
        "invention": inv,
        "viewTitle": short_caps(d.get("viewTitle", ""), 16, inv),
        "viewLines": vl,
        "kit": "generic",
    }


def make_story(topic, story_file):
    if story_file:
        story = json.load(open(story_file))
        story.setdefault("kit", "generic")
        story["sentences"] = [clean_text(s) for s in story["sentences"]]
        return story
    if re.search(r"dash ?cam|filming the road|film(ing)? the road|drivers started", topic, re.I):
        log("topic is about the road: using the hand-built dashcam story")
        return json.loads(json.dumps(DASHCAM_STORY))
    last = None
    for attempt in range(4):
        try:
            raw = groq_chat(story_prompt(topic) + ("\nRemember: JSON only, exactly 8 sentences, 78-90 words in total." if attempt else ""))
            return parse_story(raw, topic)
        except Exception as e:
            last = e
            log(f"story attempt {attempt + 1} rejected: {e}")
    if os.environ.get("STRICT_GROQ") == "1":
        raise RuntimeError(f"could not get a valid story from Groq: {last}")
    log(f"WARNING: Groq failed ({last}); using the built-in fallback story")
    story = json.loads(json.dumps(FALLBACK_STORY))
    story["fallback"] = True
    return story


# ============================================================ voice
def probe_duration(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                   "-of", "default=noprint_wrappers=1:nokey=1", path]).decode().strip()
    return float(out)


def to_wav24(src, dst):
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", dst])


def read_pcm(path):
    with wave.open(path, "rb") as w:
        assert w.getnchannels() == 1 and w.getframerate() == SR and w.getsampwidth() == 2, "bad wav format"
        return w.readframes(w.getnframes())


def proportional(tokens, t0, t1):
    wts = [len(w) + 2 + (3 if w[-1:] in ",.!?" else 0) for w in tokens]
    k = (t1 - t0) / max(1, sum(wts))
    out, t = [], t0
    for w, wt in zip(tokens, wts):
        out.append({"w": w, "s": round(t, 3), "e": round(t + wt * k, 3)})
        t += wt * k
    return out


# ---- engines: each returns (pcm bytes at 24 kHz mono s16, list of (word, start, end) relative or None)
async def _edge_one(text, voice, mp3):
    import edge_tts
    try:
        comm = edge_tts.Communicate(text, voice, boundary="WordBoundary")
    except TypeError:
        comm = edge_tts.Communicate(text, voice)
    bounds = []
    with open(mp3, "wb") as f:
        async for ch in comm.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                bounds.append((ch["text"], ch["offset"] / 1e7, (ch["offset"] + ch["duration"]) / 1e7))
    return bounds


def engine_edge(tmp):
    import asyncio
    voices = ["en-US-GuyNeural", "en-US-AndrewMultilingualNeural"]
    state = {"voice": None}

    def synth(text, i):
        mp3, wav = os.path.join(tmp, f"s{i}.mp3"), os.path.join(tmp, f"s{i}.wav")
        cands = [state["voice"]] if state["voice"] else voices
        err = None
        for v in cands:
            try:
                b = asyncio.run(asyncio.wait_for(_edge_one(text, v, mp3), timeout=60))
                if os.path.getsize(mp3) < 800:
                    raise RuntimeError("no audio")
                state["voice"] = v
                to_wav24(mp3, wav)
                return read_pcm(wav), b
            except Exception as e:
                err = e
                log(f"edge-tts {v} failed: {type(e).__name__}: {e}")
        raise RuntimeError(f"edge-tts unavailable: {err}")
    return synth


def engine_kokoro(tmp):
    import numpy as np
    from kokoro_onnx import Kokoro
    os.makedirs(MODELS, exist_ok=True)
    base = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
    for fn in ("kokoro-v1.0.int8.onnx", "voices-v1.0.bin"):
        p = os.path.join(MODELS, fn)
        if not os.path.exists(p) or os.path.getsize(p) < 1_000_000:
            log("downloading", fn)
            with requests.get(base + fn, stream=True, timeout=300) as r:
                r.raise_for_status()
                with open(p + ".tmp", "wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
            os.replace(p + ".tmp", p)
    k = Kokoro(os.path.join(MODELS, "kokoro-v1.0.int8.onnx"), os.path.join(MODELS, "voices-v1.0.bin"))

    def synth(text, i):
        a, sr = k.create(text, voice="am_adam", speed=1.0, lang="en-us")
        if sr != SR:
            raise RuntimeError(f"kokoro sample rate {sr}")
        pcm = (np.clip(a, -1, 1) * 32767).astype("<i2").tobytes()
        return pcm, None
    return synth


def engine_gtts(tmp):
    from gtts import gTTS

    def synth(text, i):
        mp3, wav = os.path.join(tmp, f"g{i}.mp3"), os.path.join(tmp, f"g{i}.wav")
        gTTS(text=text, lang="en", slow=False).save(mp3)
        to_wav24(mp3, wav)
        return read_pcm(wav), None
    return synth


def build_voice(sentences, adir):
    """Returns (words, starts, duration). Writes <adir>/vo.wav (exactly DURATION seconds)."""
    tmp = os.path.join(adir, "tmp")
    os.makedirs(tmp, exist_ok=True)
    last_err = None
    for name, factory in (("edge-tts", engine_edge), ("Kokoro", engine_kokoro), ("gTTS", engine_gtts)):
        try:
            log(f"voice engine: {name}")
            synth = factory(tmp)
            pcms, bounds = [], []
            for i, s in enumerate(sentences):
                pcm, b = synth(s, i)
                if len(pcm) < SR // 2:
                    raise RuntimeError("sentence audio too short")
                pcms.append(pcm)
                bounds.append(b)
            break
        except Exception as e:
            last_err = e
            log(f"voice engine {name} failed: {type(e).__name__}: {e}")
    else:
        raise RuntimeError(f"all voice engines failed: {last_err}")

    # stitch sentences with a short gap, remember where each sentence starts
    gap = b"\x00\x00" * int(GAP * SR)
    pcm_all, starts, cur = b"", [], 0.0
    for pcm in pcms:
        starts.append(round(cur, 3))
        pcm_all += pcm + gap
        cur += len(pcm) / 2 / SR + GAP
    raw_wav = os.path.join(adir, "vo_raw.wav")
    with wave.open(raw_wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm_all)
    total = probe_duration(raw_wav)

    # word timings: real boundaries when the engine gave them (and they match), else proportional
    words = []
    for i, s in enumerate(sentences):
        toks = s.split()
        t0 = starts[i]
        t1 = (starts[i + 1] if i + 1 < len(starts) else total) - GAP
        b = bounds[i]
        if b and len(b) == len(toks):
            words += [{"w": tok, "s": round(t0 + x[1], 3), "e": round(t0 + x[2], 3)} for tok, x in zip(toks, b)]
        else:
            words += proportional(toks, t0, t1)

    # fit to exactly DURATION: speed up a little if too long, then pad or trim
    factor = 1.0
    if total > DURATION - 0.9:
        factor = min(1.4, total / (DURATION - 0.9))
        log(f"voice is {total:.1f}s, speeding up x{factor:.2f}")
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw_wav, "-filter:a", f"atempo={factor:.4f}", os.path.join(adir, "vo_fast.wav")])
        os.replace(os.path.join(adir, "vo_fast.wav"), raw_wav)
        starts = [round(x / factor, 3) for x in starts]
        for w_ in words:
            w_["s"] = round(w_["s"] / factor, 3); w_["e"] = round(w_["e"] / factor, 3)
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw_wav, "-af", f"apad=whole_dur={DURATION},atrim=0:{DURATION}",
         "-ar", str(SR), "-ac", "1", os.path.join(adir, "vo.wav")])
    shutil.rmtree(tmp, ignore_errors=True)
    os.remove(raw_wav)
    if words[-1]["e"] > DURATION - 0.2:
        log("WARNING: narration reaches the end of the video; the script is long")
    return words, starts, probe_duration(os.path.join(adir, "vo.wav"))


# ============================================================ project + render
def setup_project(story, words, starts):
    shutil.rmtree(PROJ, ignore_errors=True)
    shutil.copytree(os.path.join(ENGINE, "template"), PROJ)
    os.makedirs(os.path.join(PROJ, "audio"), exist_ok=True)
    os.makedirs(os.path.join(PROJ, "out"), exist_ok=True)       # FFmpeg needs this to exist
    run(["node", os.path.join(ENGINE, "cast.mjs"), "new", PROJ, "--chars", "schemer,quiet,victim,officer",
         "--cars", "schemer,quiet,traffic"])
    story = dict(story)
    story["starts"] = starts
    story["seed"] = random.randint(1, 9999)
    with open(os.path.join(PROJ, "story.json"), "w") as f:
        json.dump(story, f, indent=1)
    with open(os.path.join(PROJ, "audio", "vo.words.json"), "w") as f:
        json.dump(words, f)                                     # array of {"w","s","e"} objects, as captions.js requires
    src = "dashcam_video.js" if story.get("kit") == "dashcam" else "story_video.js"
    shutil.copy(os.path.join(PIPE, src), os.path.join(PROJ, "video.js"))


def check_engine_assets():
    need = [os.path.join(ENGINE, "node_modules", "three", "build", "three.module.js"),
            os.path.join(ENGINE, "node_modules", "@fontsource", "poppins", "files", "poppins-latin-800-normal.woff2"),
            os.path.join(STUDIO, "kit", "node_modules", "playwright", "package.json")]
    missing = [p for p in need if not os.path.isfile(p)]
    if missing:
        raise RuntimeError("engine dependencies missing (npm install step failed?):\n" + "\n".join(missing))


def mean_luma(path, t):
    """Average brightness (0-255) of one frame; ~0 means the 3D view rendered black."""
    r = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(max(0.0, t)), "-i", path, "-frames:v", "1",
                        "-vf", "scale=64:114,format=gray", "-f", "rawvideo", "-"], capture_output=True)
    return (sum(r.stdout) / len(r.stdout)) if r.stdout else 0.0


def part_ok(path, length):
    try:
        if probe_duration(path) < length - 0.2:
            return False
        times = [0.4, length / 2, length - 0.4]
        lumas = [mean_luma(path, t) for t in times]
        log(f"  brightness of {os.path.basename(path)}: " + ", ".join(f"{x:.0f}" for x in lumas))
        return min(lumas) > 12
    except Exception as e:
        log("  part check failed:", e)
        return False


def render_video(parts):
    out = os.path.join(PROJ, "out")
    env = dict(os.environ, GL="swiftshader")
    chunk = DURATION / parts
    jobs = [(i, round(i * chunk, 3), round((i + 1) * chunk, 3), os.path.join(out, f"part{i}.mp4")) for i in range(parts)]
    workers = int(os.environ.get("RENDER_WORKERS", max(1, min(parts, (os.cpu_count() or 2) // 2))))

    def launch(job):
        i, a, b, dst = job
        log(f"rendering part {i}: {a}s to {b}s")
        lf = open(os.path.join(out, f"part{i}.log"), "w")
        return subprocess.Popen(["node", os.path.join(ENGINE, "film.mjs"), "render", PROJ, dst, str(a), str(b)],
                                env=env, stdout=lf, stderr=subprocess.STDOUT)

    for attempt in range(3):
        todo = [j for j in jobs if not os.path.isfile(j[3])]
        if not todo:
            break
        w = workers if attempt == 0 else 1          # retry one at a time: parallel browsers can come out black
        log(f"render pass {attempt + 1}: {len(todo)} part(s), {w} at a time")
        for k in range(0, len(todo), w):
            batch = [(j, launch(j)) for j in todo[k:k + w]]
            for j, p in batch:
                rc = p.wait()
                if rc != 0:
                    log(f"part {j[0]} failed (exit {rc}); last log lines:")
                    log("".join(open(os.path.join(out, f"part{j[0]}.log")).readlines()[-12:]))
                for stale in (j[3].replace(".mp4", ".part.mp4"),):
                    if os.path.exists(stale):
                        os.remove(stale)
                if rc != 0 or not os.path.isfile(j[3]) or not part_ok(j[3], j[2] - j[1]):
                    log(f"part {j[0]} is bad; it will be rendered again")
                    if os.path.exists(j[3]):
                        os.remove(j[3])
    bad = [j[0] for j in jobs if not os.path.isfile(j[3])]
    if bad:
        raise RuntimeError(f"render failed for parts {bad}")
    lst = os.path.join(out, "parts.txt")
    with open(lst, "w") as f:
        for j in jobs:
            f.write(f"file '{j[3]}'\n")
    silent = os.path.join(out, "silent.mp4")
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent])
    dark = [t for t in range(1, int(DURATION) - 1, 3) if mean_luma(silent, t + 0.5) < 12]
    if dark:
        raise RuntimeError(f"final video has black frames around {dark} s")
    return silent


def render_stills(times):
    env = dict(os.environ, GL="swiftshader")
    run(["node", os.path.join(ENGINE, "film.mjs"), "stills", PROJ, os.path.join(PROJ, "stills")] + [str(t) for t in times], env=env)


def mux(silent):
    out = os.path.join(PROJ, "out")
    final = os.path.join(out, "final_short.mp4")
    for crf in (23, 27, 31):
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", silent, "-i", os.path.join(PROJ, "audio", "vo.wav"),
             "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-crf", str(crf), "-preset", "medium", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-b:a", "160k", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-shortest", "-movflags", "+faststart", final])
        mb = os.path.getsize(final) / 1e6
        log(f"final_short.mp4 crf {crf}: {mb:.1f} MB")
        if mb < 49:
            break
    return final


# ============================================================ delivery
def send_telegram(video, title, hashtags):
    if not (TG_TOKEN and TG_CHAT):
        log("Telegram secrets missing; skipping delivery")
        return False
    caption = f"\U0001F3AC {title}\n\n{hashtags}"[:1024]
    base = f"https://api.telegram.org/bot{TG_TOKEN}"
    with open(video, "rb") as f:
        r = requests.post(base + "/sendVideo", data={"chat_id": TG_CHAT, "caption": caption, "supports_streaming": "true",
                                                      "width": 1080, "height": 1920}, files={"video": f}, timeout=600)
    log("Telegram sendVideo:", r.status_code, r.text[:200])
    if not r.ok:
        with open(video, "rb") as f:
            r = requests.post(base + "/sendDocument", data={"chat_id": TG_CHAT, "caption": caption}, files={"document": f}, timeout=600)
        log("Telegram sendDocument:", r.status_code, r.text[:200])
    if not r.ok:
        raise RuntimeError("Telegram delivery failed: " + r.text[:300])
    return True


# ============================================================ main
def pick_topic(raw):
    if raw and raw.lower() != "auto":
        return raw
    used_file = os.path.join(ROOT, "used_topics.json")
    try:
        used = json.load(open(used_file))
    except Exception:
        used = []
    left = [t for t in TOPICS if t not in used] or TOPICS
    t = random.choice(left)
    json.dump((used + [t])[-40:], open(used_file, "w"), indent=1)
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("topic", nargs="?", default=os.environ.get("TOPIC", "auto"))
    ap.add_argument("--story")
    ap.add_argument("--stills")
    ap.add_argument("--skip-telegram", action="store_true")
    ap.add_argument("--parts", type=int, default=int(os.environ.get("RENDER_PARTS", "3")))
    a = ap.parse_args()

    check_engine_assets()
    topic = pick_topic((a.topic or "auto").strip())
    log("topic:", topic)
    story = make_story(topic, a.story)
    log("title:", story["title"], "|", story["hashtags"])
    log("script:\n  " + "\n  ".join(story["sentences"]))

    adir = os.path.join(STUDIO, "_audio_build")             # outside PROJ, which setup_project() recreates
    shutil.rmtree(adir, ignore_errors=True)
    os.makedirs(adir)
    words, starts, dur = build_voice(story["sentences"], adir)
    log(f"voice ready: {dur:.2f}s, sentence starts {starts}")

    setup_project(story, words, starts)
    shutil.copy(os.path.join(adir, "vo.wav"), os.path.join(PROJ, "audio", "vo.wav"))
    shutil.rmtree(adir, ignore_errors=True)

    if a.stills:
        render_stills([float(x) for x in a.stills.split(",")])
        return
    silent = render_video(max(1, a.parts))
    final = mux(silent)
    info = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,width,height,r_frame_rate,duration",
                                    "-of", "default=nw=1", final]).decode()
    log(info)
    with open(os.path.join(PROJ, "out", "meta.txt"), "w") as f:
        f.write(f"{story['title']}\n{story['hashtags']}\n")
    if not a.skip_telegram:
        note = "(Groq failed, built-in fallback story) " if story.get("fallback") else ""
        send_telegram(final, note + story["title"], story["hashtags"])
    log("done:", final)


if __name__ == "__main__":
    main()

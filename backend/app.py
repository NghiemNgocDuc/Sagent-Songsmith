from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, HttpUrl


ROOT = Path(__file__).resolve().parent
WORK_DIR = ROOT / "work"
PUBLIC_DIR = ROOT / "public"
INSTRUMENTAL_DIR = PUBLIC_DIR / "instrumentals"
VOCAL_DIR = PUBLIC_DIR / "vocals"
MODEL_NAME = "htdemucs"

for directory in [WORK_DIR, INSTRUMENTAL_DIR, VOCAL_DIR]:
    directory.mkdir(parents=True, exist_ok=True)


app = FastAPI(title="Sagent Songsmith Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/files", StaticFiles(directory=PUBLIC_DIR), name="files")


class ExtractRequest(BaseModel):
    url: HttpUrl
    already_instrumental: bool = False


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/extract-instrumental")
def extract_instrumental(payload: ExtractRequest) -> dict[str, str]:
    url = str(payload.url)
    already_instrumental = payload.already_instrumental
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="Only http(s) URLs are supported.")

    cache_key = f"{url}|karaoke={int(already_instrumental)}"
    job_id = hashlib.sha1(cache_key.encode("utf-8")).hexdigest()[:16]
    instrumental_path = INSTRUMENTAL_DIR / f"{job_id}.wav"
    vocal_path = VOCAL_DIR / f"{job_id}.wav"
    metadata_path = INSTRUMENTAL_DIR / f"{job_id}.json"

    if instrumental_path.exists():
        title = read_title(metadata_path) or "Imported song"
        return build_response(job_id, title)

    job_dir = WORK_DIR / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir)
    job_dir.mkdir(parents=True, exist_ok=True)

    try:
        source_path, title = download_audio(url, job_dir)
        if already_instrumental:
            shutil.copyfile(source_path, instrumental_path)
            metadata_path.write_text(json.dumps({"title": title, "mode": "karaoke"}), encoding="utf-8")
        else:
            instrumental_source, vocal_source = separate_stems(source_path, job_dir)
            shutil.copyfile(instrumental_source, instrumental_path)
            shutil.copyfile(vocal_source, vocal_path)
            metadata_path.write_text(json.dumps({"title": title, "mode": "separated"}), encoding="utf-8")
    except subprocess.CalledProcessError as error:
        message = error.stderr or error.stdout or str(error)
        raise HTTPException(status_code=500, detail=message.strip()) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
    finally:
        if job_dir.exists():
            shutil.rmtree(job_dir, ignore_errors=True)

    return build_response(job_id, title)


def build_response(job_id: str, title: str) -> dict[str, str]:
    return {
        "job_id": job_id,
        "title": title,
        "instrumental_url": f"http://127.0.0.1:8000/files/instrumentals/{job_id}.wav",
        "vocal_url": f"http://127.0.0.1:8000/files/vocals/{job_id}.wav",
        "mode": read_mode(INSTRUMENTAL_DIR / f"{job_id}.json") or "separated",
    }


def read_title(path: Path) -> str | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("title")
    except Exception:
        return None


def read_mode(path: Path) -> str | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("mode")
    except Exception:
        return None


def download_audio(url: str, job_dir: Path) -> tuple[Path, str]:
    output_template = job_dir / "source.%(ext)s"
    title = None
    source_path = None

    if is_youtube_url(url):
        title = fetch_youtube_title(url)
        command = [
            "yt-dlp",
            "--no-playlist",
            "--extract-audio",
            "--audio-format",
            "wav",
            "--audio-quality",
            "0",
            "--js-runtimes",
            "node",
            "--output",
            str(output_template),
            url,
        ]
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        candidates = sorted(path for path in job_dir.glob("source.*") if path.is_file())
        if not candidates:
            raise FileNotFoundError("yt-dlp did not produce an audio file.")
        source_path = candidates[0]
    else:
        title = Path(urlparse(url).path).stem or "Imported song"
        source_path = download_direct_file(url, job_dir)

    if source_path.suffix.lower() == ".wav":
        return source_path, title or source_path.stem

    wav_path = job_dir / "source.wav"
    convert_to_wav(source_path, wav_path)
    return wav_path, title or wav_path.stem


def fetch_youtube_title(url: str) -> str | None:
    command = [
        "yt-dlp",
        "--no-playlist",
        "--dump-single-json",
        "--js-runtimes",
        "node",
        url,
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    payload = json.loads(result.stdout)
    return payload.get("title")


def is_youtube_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return "youtube.com" in host or "youtu.be" in host


def download_direct_file(url: str, job_dir: Path) -> Path:
    parsed = urlparse(url)
    suffix = Path(parsed.path).suffix or ".bin"
    output_path = job_dir / f"source-download{suffix}"
    with urlopen(url) as response, output_path.open("wb") as output:
        shutil.copyfileobj(response, output)
    return output_path


def convert_to_wav(source_path: Path, wav_path: Path) -> None:
    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(source_path),
        "-vn",
        "-ac",
        "2",
        "-ar",
        "44100",
        str(wav_path),
    ]
    subprocess.run(command, capture_output=True, text=True, check=True)


def separate_stems(source_path: Path, job_dir: Path) -> tuple[Path, Path]:
    output_dir = job_dir / "separated"
    command = [
        "python",
        "-m",
        "demucs.separate",
        "--two-stems",
        "vocals",
        "--device",
        "cpu",
        "--out",
        str(output_dir),
        str(source_path),
    ]
    subprocess.run(command, capture_output=True, text=True, check=True)

    stem_dir = output_dir / MODEL_NAME / source_path.stem
    instrumental = stem_dir / "no_vocals.wav"
    vocals = stem_dir / "vocals.wav"
    if not instrumental.exists() or not vocals.exists():
        raise FileNotFoundError("Demucs finished, but the expected stem files were not found.")
    return instrumental, vocals


def first_nonempty_line(text: str) -> str | None:
    for line in text.splitlines():
        cleaned = line.strip()
        if cleaned:
            return cleaned
    return None

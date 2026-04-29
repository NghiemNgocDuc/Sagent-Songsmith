# Sagent Songsmith

Sagent Songsmith is a web-based music prototype for building vocal covers. A user can record or upload a vocal take, bring in a source song, remove or reduce the original lead vocal with a backend stem-separation step, and render a new blended cover in the browser. The project combines a static frontend with a lightweight Python API so the user experience feels immediate while still supporting heavier audio-processing tasks.

This repository contains both parts of the system:

- a browser frontend for recording, uploading, previewing, analyzing, and rendering audio
- a Python backend for importing songs from URLs and generating instrumental and vocal stems

## Project Overview

The core idea behind Sagent Songsmith is to let someone quickly test the experience of singing over an existing song without opening a digital audio workstation. The app accepts a vocal performance from the user, accepts a song file or a song URL, prepares the source material, and produces a downloadable WAV file of the resulting cover.

The frontend is designed to do as much work as possible in the browser. It handles interaction, recording, waveform loading, audio analysis, styling choices, synthesis layers, mix shaping, rendering, previewing, and local saving. The backend is responsible for the tasks that are either too heavy or too dependent on external tools to run purely in the client, such as downloading audio from supported URLs, converting formats, and separating vocals from instrumentals.

## Features

- Upload a vocal take from a local device
- Record a vocal take directly in the browser
- Upload a song audio file from the local device
- Import a song from a URL through the backend
- Mark a song as already instrumental or karaoke to skip separation
- Separate a full song into instrumental and vocal stems with Demucs
- Analyze source material and estimate musical characteristics
- Render a polished browser-generated cover as a WAV file
- Preview the vocal input, song input, and final result in the browser
- Save rendered songs locally in the browser using IndexedDB
- Deploy the frontend as a static site while keeping the backend separate

## How the App Works

At a high level, the project follows this flow:

1. The user provides a vocal take by uploading a file or recording inside the browser.
2. The user provides a song by uploading an audio file or pasting a song URL.
3. If the song comes from a URL and is not already instrumental, the backend downloads it, converts it when necessary, and runs stem separation.
4. The frontend loads the prepared audio, analyzes the vocal and backing track, and builds a rendered cover using the Web Audio API.
5. The final output is exported as a WAV file for playback, download, and optional local saving.

The browser render is not a simple file concatenation. The frontend performs trimming, pitch-related analysis, signal shaping, and additional synthesis and mix processing to create a more produced result.

## Architecture

### Frontend

The frontend is a static application built with plain HTML, CSS, and JavaScript. There is no framework dependency. The browser is responsible for:

- user interface rendering
- file upload handling
- microphone recording
- audio decoding
- audio analysis
- vocal and song preparation
- final cover rendering
- playback and download
- local storage of saved songs

Key frontend files:

- `index.html` contains the main studio interface
- `saved.html` contains the saved songs view
- `styles.css` contains the styling for the interface
- `app.js` contains the main studio logic and audio pipeline
- `saved.js` contains logic for the saved songs view
- `config.js` contains the backend base URL used by the frontend

### Backend

The backend is a FastAPI application that provides a small API for source acquisition and stem preparation. It is responsible for:

- checking service health
- downloading audio from supported URLs
- converting downloaded media into WAV when needed
- running Demucs stem separation
- serving generated instrumental and vocal files

Key backend files:

- `backend/app.py` contains the FastAPI application
- `backend/requirements.txt` lists the Python package dependencies

The backend also uses runtime directories under `backend/public` and `backend/work` for generated output and temporary processing data. These are intentionally ignored by Git because they can become large and are not source files.

## Repository Structure

```text
Sagent-Songsmith/
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── public/
├── app.js
├── config.js
├── index.html
├── README.md
├── saved.html
├── saved.js
└── styles.css
```

## Technology Stack

Frontend technologies:

- HTML
- CSS
- JavaScript
- Web Audio API
- MediaRecorder API
- IndexedDB

Backend technologies:

- Python
- FastAPI
- Uvicorn
- yt-dlp
- ffmpeg
- Demucs

## Requirements

To run the full project locally, you will need:

- Python 3.10 or newer is recommended
- Git
- ffmpeg available on your system path
- yt-dlp available on your system path
- a working installation of Demucs
- a modern browser with support for Web Audio and MediaRecorder

The backend depends on command-line tools as well as Python packages. If `ffmpeg`, `yt-dlp`, or Demucs are missing, the URL import and separation flow will fail even if the frontend loads correctly.

## Local Setup

### 1. Clone the repository

```powershell
git clone https://github.com/NghiemNgocDuc/Sagent-Songsmith.git
cd Sagent-Songsmith
```

### 2. Create and activate a virtual environment

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### 3. Install Python dependencies

```powershell
pip install -r backend/requirements.txt
```

Depending on your environment, you may also need to install or verify:

- `ffmpeg`
- `yt-dlp`
- Demucs and its model dependencies

### 4. Start the backend

```powershell
uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

The backend will be available at:

`http://127.0.0.1:8000`

### 5. Confirm frontend configuration

The default `config.js` points to the local backend:

```js
window.SAGENT_CONFIG = {
  apiBase: "http://127.0.0.1:8000",
};
```

### 6. Open the frontend

You can open `index.html` directly in a browser for simple testing, or serve the project directory with any static file server. A local static server is usually more reliable for browser-based development.

Example:

```powershell
python -m http.server 5500
```

Then open:

`http://127.0.0.1:5500`

## Usage

### Recording or uploading a vocal

The user can either:

- upload a vocal file from the local device
- record a vocal directly in the browser

Once loaded, the app previews the vocal and updates the status pipeline.

### Providing a song source

The user can either:

- upload a local song file
- paste a supported song URL and let the backend fetch it

If the song is already karaoke or instrumental, the user can indicate that to skip stem separation and reduce processing time.

### Rendering a cover

After both sources are loaded, the user can:

- choose a style preset
- adjust tail buffer and polish settings
- trigger cover generation

The app then:

- decodes the audio
- analyzes vocal and song characteristics
- derives musical and mix information
- renders a new cover buffer
- exports the final result as a WAV file

### Saving songs

Rendered songs can be saved in the browser using IndexedDB. This is local to the user’s browser and machine. Saved songs are not uploaded to a server and are not shared across devices.

## Deployment

### Frontend deployment

The frontend can be hosted as a static site. This repository includes a GitHub Pages workflow in `.github/workflows/deploy-pages.yml` to publish the frontend files from the `main` branch.

The expected public frontend URL for this repository is:

`https://nghiemngocduc.github.io/Sagent-Songsmith/`

### Backend deployment

The backend cannot run on GitHub Pages because GitHub Pages only serves static files. To make the full application available to other users, the backend must be deployed separately to a service that supports Python applications and external command-line tools.

Possible hosting options include:

- Render
- Railway
- Fly.io
- a virtual private server
- a local machine exposed through a public tunnel for testing only

After deploying the backend, update `config.js` so the frontend points to the public API:

```js
window.SAGENT_CONFIG = {
  apiBase: "https://your-backend-domain.com",
};
```

Without a public backend, other users may still load the interface, upload local audio files, and interact with the static frontend, but backend-dependent features such as song URL import and automated stem extraction will not work for them.

## API

### `GET /api/health`

Returns a simple health status response.

Example response:

```json
{
  "status": "ok"
}
```

### `POST /api/extract-instrumental`

Downloads a song from a URL and either:

- returns it directly as the instrumental if it is already karaoke or instrumental
- runs stem separation and returns the separated instrumental and vocal URLs

Example request body:

```json
{
  "url": "https://www.youtube.com/watch?v=example",
  "already_instrumental": false
}
```

Example response body:

```json
{
  "job_id": "1234567890abcdef",
  "title": "Imported song",
  "instrumental_url": "http://127.0.0.1:8000/files/instrumentals/1234567890abcdef.wav",
  "vocal_url": "http://127.0.0.1:8000/files/vocals/1234567890abcdef.wav",
  "mode": "separated"
}
```

## Generated Files and Git Hygiene

This project can generate large audio files during normal use. Those files are created under backend runtime directories and should not be committed to version control.

Ignored generated content includes:

- temporary backend work files
- cached instrumental files
- cached vocal files
- Python bytecode cache files

This keeps the repository smaller, prevents GitHub upload failures, and ensures source control contains code rather than generated media artifacts.

## Current Limitations

- Stem separation depends on backend tooling and can be slow on CPU-only systems.
- The quality of vocal removal depends on the source material and Demucs output.
- Browser-based rendering can be resource-intensive for longer files.
- Saved songs are stored locally in the browser and are not synchronized.
- The public frontend alone is not enough for full functionality without a deployed backend.
- URL import reliability depends on the source platform, network access, and external tools.

## Troubleshooting

### The frontend loads but URL import does not work

Check that:

- the backend is running
- `config.js` points to the correct backend URL
- the backend host is reachable from the browser
- `yt-dlp`, `ffmpeg`, and Demucs are installed correctly

### GitHub rejects the repository upload

This usually means large generated audio files were included. Make sure the ignored runtime directories are not being committed and that generated WAV files under backend cache folders are removed before upload.

### The site publishes on GitHub Pages but some features fail for other users

This usually means the frontend is live but the backend is still local. Deploy the backend publicly and update `config.js` to use the live backend domain.

### Microphone recording does not start

Check that:

- the browser supports microphone access
- microphone permission has been granted
- the page is being opened in an environment where recording is allowed

## Future Improvements

Potential next steps for the project could include:

- backend deployment automation
- authentication and cloud storage for saved songs
- more advanced pitch correction and timing alignment
- waveform visualization
- queueing or background processing for longer jobs
- progress reporting for downloads and stem separation
- support for more export formats
- more detailed project configuration and environment management

## Contributing

Contributions are welcome. If you plan to extend the project, it is a good idea to keep the separation between static frontend code and backend processing responsibilities clear. Large generated assets should remain excluded from version control, and any changes to deployment should consider the split between GitHub Pages and the Python API host.

## License

No license file is currently included in this repository. If you intend to share, reuse, or accept external contributions for this project, adding an explicit license is recommended.

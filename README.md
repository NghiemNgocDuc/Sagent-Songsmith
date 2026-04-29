# Sagent Songsmith

Sagent Songsmith is a static browser frontend plus a Python backend that can:

- record or upload a singer vocal
- import a song from a file or URL
- separate the song into instrumental and vocal stems with Demucs
- render a blended cover in the browser

## Why GitHub was rejecting the folder

The folder contained generated `.wav` cache files under `backend/public` and scratch files under `backend/work`. Some of those files were over 25 MB, which the GitHub web uploader rejects.

Those files are not source code, so they should not be committed. The included `.gitignore` now excludes them.

## Hosting reality

GitHub Pages can host the frontend files:

- `index.html`
- `saved.html`
- `styles.css`
- `app.js`
- `saved.js`
- `config.js`

GitHub Pages cannot run the backend in `backend/app.py`.

That means:

1. The frontend can live on GitHub Pages.
2. The Python backend must run somewhere else, such as your own PC, Render, Railway, Fly.io, or another VM.
3. `config.js` tells the frontend where that backend lives.

## Configure the backend URL

Edit `config.js` before deploying the frontend:

```js
window.SAGENT_CONFIG = {
  apiBase: "https://your-backend-domain.com",
};
```

For local development, the default is:

```js
window.SAGENT_CONFIG = {
  apiBase: "http://127.0.0.1:8000",
};
```

## Local backend

The backend expects:

- Python
- `ffmpeg`
- `yt-dlp`
- Demucs
- FastAPI and Uvicorn

Typical run command:

```powershell
uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

## Publish the frontend on GitHub Pages

1. Create a new GitHub repository.
2. Upload the repo contents after the large generated audio files are removed.
3. In repository settings, enable GitHub Pages for the root branch.
4. Make sure `config.js` points to your deployed backend URL.

## Notes

- Uploading a song file from the device works entirely in the browser.
- Importing a song from a URL still requires the backend.
- Stem separation still requires the backend.

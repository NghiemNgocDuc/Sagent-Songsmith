const DB_NAME = "sagent-songsmith";
const STORE_NAME = "songs";
const savedRoot = document.querySelector("#savedRoot");

init();

async function init() {
  try {
    const songs = await getAllSongs();
    renderSongs(songs);
  } catch (error) {
    savedRoot.innerHTML = `<div class="empty-library">Could not load songs: ${error.message}</div>`;
  }
}

function openSongDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function getAllSongs() {
  const db = await openSongDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const songs = request.result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      resolve(songs);
    };
  });
}

async function deleteSong(id) {
  const db = await openSongDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function renderSongs(songs) {
  if (!songs.length) {
    savedRoot.innerHTML = `<div class="empty-library">No saved songs yet. Go make one in the studio, then hit Save Song.</div>`;
    return;
  }

  savedRoot.innerHTML = `<div class="saved-grid"></div>`;
  const grid = savedRoot.querySelector(".saved-grid");

  songs.forEach((song) => {
    const url = URL.createObjectURL(song.blob);
    const card = document.createElement("article");
    card.className = "saved-card";
    card.innerHTML = `
      <h3>${escapeHtml(song.name)}</h3>
      <p class="saved-meta">${escapeHtml(song.style)} | ${Math.round(song.duration)}s | ${new Date(song.createdAt).toLocaleString()}</p>
      <audio controls src="${url}"></audio>
      <div class="saved-actions">
        <a class="primary-button" href="${url}" download="${escapeAttribute(song.name)}.wav">Download</a>
        <button class="ghost-button" type="button" data-delete="${song.id}">Delete</button>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      await deleteSong(button.dataset.delete);
      const songsNext = await getAllSongs();
      renderSongs(songsNext);
    });
  });
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function escapeAttribute(value) {
  return value.replace(/"/g, "");
}

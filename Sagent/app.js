const MAX_SOURCE_SECONDS = 185;
const DEFAULT_TAIL_SECONDS = 5;
const DB_NAME = "sagent-songsmith";
const STORE_NAME = "songs";
const statusItems = [...document.querySelectorAll("#statusList li")];
const resultPreview = document.querySelector("#resultPreview");
const downloadBtn = document.querySelector("#downloadBtn");
const saveBtn = document.querySelector("#saveBtn");
const generateBtn = document.querySelector("#generateBtn");
const regenerateBtn = document.querySelector("#regenerateBtn");
const analysisCard = document.querySelector("#analysisCard");
const lengthRange = document.querySelector("#lengthRange");
const energyRange = document.querySelector("#energyRange");
const lengthValue = document.querySelector("#lengthValue");
const energyValue = document.querySelector("#energyValue");
const coverPanel = document.querySelector("#coverPanel");
const vocalFileInput = document.querySelector("#vocalFile");
const songFileInput = document.querySelector("#songFile");
const vocalDropzone = document.querySelector("#vocalDropzone");
const songDropzone = document.querySelector("#songDropzone");
const vocalPreview = document.querySelector("#vocalPreview");
const songPreview = document.querySelector("#songPreview");
const vocalMeta = document.querySelector("#vocalMeta");
const songMeta = document.querySelector("#songMeta");
const songUrlInput = document.querySelector("#songUrl");
const songUrlNote = document.querySelector("#songUrlNote");
const fetchSongUrlBtn = document.querySelector("#fetchSongUrlBtn");
const karaokeToggle = document.querySelector("#karaokeToggle");
const recordVocalBtn = document.querySelector("#recordVocalBtn");
const stopVocalBtn = document.querySelector("#stopVocalBtn");
const recordingNote = document.querySelector("#recordingNote");
const controlTitle = document.querySelector("#controlTitle");
const lengthLabel = document.querySelector("#lengthLabel");
const energyLabel = document.querySelector("#energyLabel");

let selectedStyle = "electro-pop";
let loadedCoverVocal = null;
let loadedCoverSong = null;
let renderedSongUrl = null;
let currentRender = null;
let vocalRecorder = null;
let vocalRecorderStream = null;
let vocalRecorderChunks = [];
const API_BASE = "http://127.0.0.1:8000";

const stylePresets = {
  "electro-pop": { bpm: 118, root: 0, mode: "major", chordWave: "sawtooth", bassWave: "triangle", progression: [0, 5, 3, 4], accentPattern: [1, 0.3, 0.55, 0.25], swing: 0.03 },
  "lo-fi": { bpm: 84, root: 5, mode: "minor", chordWave: "triangle", bassWave: "sine", progression: [0, 3, 5, 4], accentPattern: [1, 0.18, 0.4, 0.22], swing: 0.045 },
  trap: { bpm: 140, root: 9, mode: "minor", chordWave: "square", bassWave: "sine", progression: [0, 5, 4, 3], accentPattern: [1, 0.12, 0.24, 0.45], swing: 0.02 },
  cinematic: { bpm: 96, root: 2, mode: "minor", chordWave: "sine", bassWave: "triangle", progression: [0, 5, 4, 6], accentPattern: [1, 0.2, 0.5, 0.35], swing: 0.01 },
  house: { bpm: 124, root: 7, mode: "major", chordWave: "sawtooth", bassWave: "square", progression: [0, 4, 5, 3], accentPattern: [1, 0.45, 0.6, 0.32], swing: 0.018 },
  indie: { bpm: 108, root: 4, mode: "major", chordWave: "triangle", bassWave: "triangle", progression: [0, 4, 3, 5], accentPattern: [1, 0.25, 0.48, 0.2], swing: 0.028 },
};

document.querySelectorAll(".style-chip").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".style-chip").forEach((chip) => chip.classList.remove("active"));
    button.classList.add("active");
    selectedStyle = button.dataset.style;
  });
});

lengthRange.addEventListener("input", () => {
  lengthValue.textContent = `${lengthRange.value}s`;
});

energyRange.addEventListener("input", () => {
  energyValue.textContent = `${energyRange.value}%`;
});

setupDropzone(vocalDropzone, loadCoverVocalFile);
setupDropzone(songDropzone, loadCoverSongFile);

vocalFileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (file) {
    await loadCoverVocalFile(file);
  }
});

songFileInput.addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (file) {
    await loadCoverSongFile(file);
  }
});

recordVocalBtn.addEventListener("click", async () => {
  await startVocalRecording();
});

stopVocalBtn.addEventListener("click", async () => {
  await stopVocalRecording();
});

fetchSongUrlBtn.addEventListener("click", async () => {
  const url = songUrlInput.value.trim();
  if (!url) {
    alert("Paste a song URL first.");
    return;
  }

  try {
    setStatus(0, "active");
    const alreadyInstrumental = karaokeToggle.checked || looksLikeKaraokeUrl(url);
    songMeta.textContent = looksLikeYouTubeUrl(url)
      ? alreadyInstrumental
        ? "Downloading karaoke track with the local backend..."
        : "Downloading song and extracting instrumental with the local backend..."
      : alreadyInstrumental
        ? "Importing instrumental track with the local backend..."
        : "Importing song and extracting instrumental with the local backend...";
    songUrlNote.textContent = alreadyInstrumental
      ? "The backend is fetching the karaoke track as-is so you can render faster."
      : "The backend is fetching the song, separating vocals, and keeping the instrumental stem.";
    const extraction = await extractInstrumentalFromBackend(url, alreadyInstrumental);
    const file = await fetchAudioFromUrl(extraction.instrumental_url, `${slugify(extraction.title || "instrumental")}.wav`);
    await loadCoverSongFile(file);
    songMeta.textContent = extraction.mode === "karaoke"
      ? `${extraction.title || "Song"} karaoke track loaded from the backend.`
      : `${extraction.title || "Song"} instrumental loaded from the backend.`;
    songUrlNote.textContent = extraction.mode === "karaoke"
      ? "Karaoke backing loaded. Stem separation was skipped to keep imports quick."
      : "Instrumental ready. The removed vocal stem is kept on the backend, and Singer Mode now uses the backing track.";
  } catch (error) {
    const message = error instanceof TypeError
      ? "Could not reach the local backend at http://127.0.0.1:8000. Start the backend server and try again."
      : error.message;
    alert(message);
    resetStatus();
    songUrlNote.textContent = error instanceof TypeError
      ? "The browser could not reach the local backend. Start the backend server, then try the link again."
      : "The backend could not finish the extraction. Check that the backend server is running and try another song URL if needed.";
  }
});

generateBtn.addEventListener("click", async () => {
  await generateCoverSong();
});

regenerateBtn.addEventListener("click", async () => {
  await generateCoverSong();
});

saveBtn.addEventListener("click", async () => {
  if (!currentRender) {
    alert("Generate a song first.");
    return;
  }

  try {
    await saveSongRecord(currentRender);
    songMeta.textContent = `Saved "${currentRender.name}" to your local library.`;
  } catch (error) {
    alert(`Could not save song: ${error.message}`);
  }
});

async function loadCoverVocalFile(file) {
  resetStatus();
  setStatus(0, "complete");

  if (loadedCoverVocal?.objectUrl) {
    URL.revokeObjectURL(loadedCoverVocal.objectUrl);
  }

  const objectUrl = URL.createObjectURL(file);
  vocalPreview.src = objectUrl;
  vocalPreview.load();
  loadedCoverVocal = { file, objectUrl };
  vocalMeta.textContent = `${file.name || "Singer take"} loaded (${formatBytes(file.size)}).`;
  recordingNote.textContent = "Vocal ready. You can upload another take or record a fresh one here.";
}

async function loadCoverSongFile(file) {
  resetStatus();
  setStatus(0, "complete");

  if (loadedCoverSong?.objectUrl) {
    URL.revokeObjectURL(loadedCoverSong.objectUrl);
  }

  const objectUrl = URL.createObjectURL(file);
  songPreview.src = objectUrl;
  songPreview.load();
  loadedCoverSong = { file, objectUrl };
  songMeta.textContent = `${file.name || "Song source"} loaded (${formatBytes(file.size)}).`;
}

async function startVocalRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("This browser does not support in-app recording.");
    return;
  }

  if (vocalRecorder?.state === "recording") {
    return;
  }

  try {
    vocalRecorderStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    vocalRecorderChunks = [];
    const mimeType = pickRecordingMimeType();
    vocalRecorder = mimeType
      ? new MediaRecorder(vocalRecorderStream, { mimeType })
      : new MediaRecorder(vocalRecorderStream);

    vocalRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        vocalRecorderChunks.push(event.data);
      }
    });

    vocalRecorder.addEventListener("stop", async () => {
      const blob = new Blob(vocalRecorderChunks, { type: vocalRecorder.mimeType || "audio/webm" });
      const extension = blob.type.includes("ogg") ? "ogg" : "webm";
      const file = new File([blob], `live-vocal-take.${extension}`, { type: blob.type });
      await loadCoverVocalFile(file);
      recordingNote.textContent = "Recorded take loaded from your microphone.";
      cleanupVocalRecording();
      syncRecordingButtons(false);
    });

    vocalRecorder.start();
    syncRecordingButtons(true);
    recordingNote.textContent = "Recording now. Sing your take, then press Stop when you're done.";
    vocalMeta.textContent = "Microphone is live. Recording a new vocal take...";
  } catch (error) {
    cleanupVocalRecording();
    syncRecordingButtons(false);
    alert(`Could not start recording: ${error.message}`);
  }
}

async function stopVocalRecording() {
  if (!vocalRecorder || vocalRecorder.state !== "recording") {
    return;
  }
  vocalRecorder.stop();
  recordingNote.textContent = "Finishing your take...";
}

function syncRecordingButtons(isRecording) {
  recordVocalBtn.disabled = isRecording;
  stopVocalBtn.disabled = !isRecording;
  vocalDropzone.classList.toggle("disabled-dropzone", isRecording);
}

function cleanupVocalRecording() {
  if (vocalRecorderStream) {
    vocalRecorderStream.getTracks().forEach((track) => track.stop());
  }
  vocalRecorder = null;
  vocalRecorderStream = null;
  vocalRecorderChunks = [];
}

function pickRecordingMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"];
  return candidates.find((candidate) => window.MediaRecorder?.isTypeSupported?.(candidate)) || "";
}

async function generateCoverSong() {
  if (!loadedCoverVocal?.file || !loadedCoverSong?.file) {
    alert("Load both your vocal take and the song audio first.");
    return;
  }

  try {
    currentRender = null;
    setStatus(1, "active");
    const [rawVocalBuffer, rawSongBuffer] = await Promise.all([
      decodeAudioFile(loadedCoverVocal.file),
      decodeAudioFile(loadedCoverSong.file),
    ]);
    const analysis = analyzeCoverSong(rawSongBuffer, rawVocalBuffer, selectedStyle);
    const vocalBuffer = trimAudioBuffer(rawVocalBuffer, Math.min(rawVocalBuffer.duration, analysis.songLength));
    const songBuffer = trimAudioBuffer(rawSongBuffer, Math.min(rawSongBuffer.duration, analysis.songLength));
    setStatus(1, "complete");
    await breathe();

    setStatus(2, "active");
    renderCoverAnalysis(analysis);
    setStatus(2, "complete");
    await breathe();

    setStatus(3, "active");
    const coverBuffer = await buildCoverSong(songBuffer, vocalBuffer, analysis);
    setStatus(3, "complete");
    await breathe();

    setStatus(4, "active");
    const wavBlob = audioBufferToWav(coverBuffer);
    const wavUrl = URL.createObjectURL(wavBlob);
    if (renderedSongUrl) {
      URL.revokeObjectURL(renderedSongUrl);
    }
    renderedSongUrl = wavUrl;
    resultPreview.src = wavUrl;
    resultPreview.load();
    downloadBtn.href = wavUrl;
    downloadBtn.classList.remove("disabled");
    currentRender = {
      id: crypto.randomUUID(),
      name: buildCoverName(loadedCoverSong.file.name || "Song", loadedCoverVocal.file.name || "Singer"),
      blob: wavBlob,
      createdAt: new Date().toISOString(),
      style: `cover | ${analysis.style}`,
      duration: Number(analysis.songLength),
      sourceName: loadedCoverSong.file.name || "Song source",
    };
    setStatus(4, "complete");
    songMeta.textContent = `Cover render finished. The backing track runs for the full instrumental length${analysis.tailPadding > 0 ? ` with a ${analysis.tailPadding}s tail window` : ""}.`;
    vocalMeta.textContent = "Your vocal was gently tuned, leveled, and blended over the backing track.";
  } catch (error) {
    console.error(error);
    alert(`Cover generation hit a snag: ${error.message}`);
    resetStatus();
  }
}

function renderModeHint() {
  coverPanel.classList.remove("hidden");
  controlTitle.textContent = "Shape your cover before rendering";
  lengthLabel.textContent = "Tail buffer";
  energyLabel.textContent = "Polish";
  lengthRange.min = "0";
  lengthRange.max = "10";
  lengthRange.value = String(DEFAULT_TAIL_SECONDS);
  lengthValue.textContent = `${lengthRange.value}s`;
  generateBtn.textContent = "Build my cover";
  regenerateBtn.textContent = "Render another pass";
  analysisCard.innerHTML = `<p class="analysis-empty">Load your vocal and the song audio to see key, stem, and mix notes for the cover render.</p>`;
}

function setupDropzone(zone, onFile) {
  ["dragenter", "dragover"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add("dragover");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove("dragover");
    });
  });

  zone.addEventListener("drop", async (event) => {
    const [file] = [...event.dataTransfer.files];
    if (file && file.type.startsWith("audio/")) {
      await onFile(file);
    }
  });
}

async function fetchAudioFromUrl(url, fallbackName) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch audio: ${response.status}`);
  }
  const blob = await response.blob();
  const fileName = getFileNameFromUrl(url) || fallbackName;
  return new File([blob], fileName, { type: blob.type || "audio/mpeg" });
}

function looksLikeYouTubeUrl(url) {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

function looksLikeKaraokeUrl(url) {
  return /karaoke|instrumental|minus[\s-]?one|backing[\s-]?track/i.test(url);
}

async function extractInstrumentalFromBackend(url, alreadyInstrumental = false) {
  const response = await fetch(`${API_BASE}/api/extract-instrumental`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, already_instrumental: alreadyInstrumental }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Backend extraction failed.");
  }
  return payload;
}

function getFileNameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const tail = pathname.split("/").filter(Boolean).pop();
    return tail || "";
  } catch {
    return "";
  }
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "instrumental";
}

async function decodeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  const tempContext = new AudioContext();
  const decoded = await tempContext.decodeAudioData(arrayBuffer.slice(0));
  await tempContext.close();
  return decoded;
}

function trimAudioBuffer(audioBuffer, targetDuration) {
  const boundedDuration = Math.max(0.05, Math.min(targetDuration, MAX_SOURCE_SECONDS, audioBuffer.duration));
  const frameCount = Math.floor(boundedDuration * audioBuffer.sampleRate);
  const trimmed = new AudioBuffer({
    length: frameCount,
    numberOfChannels: audioBuffer.numberOfChannels,
    sampleRate: audioBuffer.sampleRate,
  });

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    trimmed.copyToChannel(audioBuffer.getChannelData(channel).subarray(0, frameCount), channel, 0);
  }

  return trimmed;
}

function analyzeAudio(audioBuffer, style) {
  const preset = stylePresets[style];
  const mono = mixToMono(audioBuffer);
  const rms = computeRms(mono);
  const brightness = estimateBrightness(mono, audioBuffer.sampleRate);
  const centroid = estimateSpectralCentroid(mono, audioBuffer.sampleRate);
  const envelope = sampleEnvelope(mono, audioBuffer.sampleRate, 40);
  const density = envelope.filter((value) => value > rms * 0.9).length / Math.max(envelope.length, 1);
  const tempoPulse = estimatePulse(envelope);
  const targetBpm = clamp(Math.round((preset.bpm * 0.72 + tempoPulse * 42 + brightness * 16 + density * 22) / 2) * 2, 78, 154);
  const vocalWindow = findLoudestWindow(mono, audioBuffer.sampleRate, 0.7);
  const detectedPitch = estimatePitchAutocorrelation(mono.subarray(vocalWindow.start, vocalWindow.end), audioBuffer.sampleRate);
  const rootFromPitch = Number.isFinite(detectedPitch) ? frequencyToPitchClass(detectedPitch) : preset.root;
  const mode = brightness + centroid > 1.05 ? "major" : preset.mode;

  return {
    bpm: targetBpm,
    keyIndex: (rootFromPitch + preset.root) % 12,
    detectedPitch,
    rms,
    brightness,
    centroid,
    density,
    mode,
    style,
    songLength: Number(lengthRange.value),
    energy: Number(energyRange.value) / 100,
    sourceDuration: audioBuffer.duration,
    hotspots: findHotspots(envelope, audioBuffer.duration),
    preset,
  };
}

function renderAnalysis(analysis) {
  const keyNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  analysisCard.innerHTML = `
    <div class="analysis-grid">
      <div><span>Detected BPM</span><strong>${analysis.bpm}</strong></div>
      <div><span>Song key</span><strong>${keyNames[analysis.keyIndex]} ${analysis.mode}</strong></div>
      <div><span>Vocal focus</span><strong>Kept in mix</strong></div>
      <div><span>Render mode</span><strong>Polished</strong></div>
    </div>
  `;
}

function analyzeCoverSong(songBuffer, vocalBuffer, style) {
  const songAnalysis = analyzeAudio(songBuffer, style);
  const vocalAnalysis = analyzeAudio(vocalBuffer, style);
  const tailPadding = clamp(Number(lengthRange.value) || DEFAULT_TAIL_SECONDS, 0, 10);
  const songLength = resolveCoverRenderDuration(songBuffer.duration, vocalBuffer.duration, tailPadding);
  const singerCorrectionRatio = computeGentleCorrectionRatio(
    vocalAnalysis.detectedPitch,
    songAnalysis.keyIndex,
    songAnalysis.mode,
  );

  return {
    ...songAnalysis,
    songLength,
    tailPadding,
    instrumentalDuration: Math.min(songBuffer.duration, MAX_SOURCE_SECONDS),
    singerPitch: vocalAnalysis.detectedPitch,
    singerBrightness: vocalAnalysis.brightness,
    singerRms: vocalAnalysis.rms,
    singerHotspots: vocalAnalysis.hotspots,
    singerCorrectionRatio,
    separationMode: songBuffer.numberOfChannels > 1 ? "Stereo center split" : "Mono fallback",
  };
}

function renderCoverAnalysis(analysis) {
  const keyNames = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  analysisCard.innerHTML = `
    <div class="analysis-grid">
      <div><span>Song key</span><strong>${keyNames[analysis.keyIndex]} ${analysis.mode}</strong></div>
      <div><span>Guide BPM</span><strong>${analysis.bpm}</strong></div>
      <div><span>Stem split</span><strong>${analysis.separationMode}</strong></div>
      <div><span>Render length</span><strong>${analysis.songLength.toFixed(1)}s</strong></div>
    </div>
  `;
}

async function buildSong(audioBuffer, analysis) {
  const sampleRate = 44100;
  const frameCount = Math.ceil(analysis.songLength * sampleRate);
  const offline = new OfflineAudioContext(2, frameCount, sampleRate);
  const arrangement = buildArrangement(analysis.songLength, analysis.bpm);
  const buses = createMixBuses(offline, analysis.energy, analysis.brightness);
  const scale = analysis.mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  const rootFrequency = midiToFrequency(48 + analysis.keyIndex);
  const vocalSource = extractCenterChannel(audioBuffer);
  const bedSource = extractSideBed(audioBuffer);

  for (const [index, section] of arrangement.entries()) {
    scheduleVocalTrack(offline, buses.vocalBus, buses.vocalVerbBus, vocalSource, analysis, section, rootFrequency);
    scheduleSourceBed(offline, buses.sourceBus, bedSource, analysis, section, index);
    scheduleSourcePads(offline, buses.padBus, buses.reverbBus, bedSource, analysis, section, index, rootFrequency);
    scheduleSourceLead(offline, buses.leadBus, buses.delayBus, vocalSource, analysis, section, index, rootFrequency);
    scheduleDrums(offline, buses.drumBus, section, analysis);
    scheduleBass(offline, buses.bassBus, section, analysis, rootFrequency, scale);
    scheduleHarmony(offline, buses.musicBus, buses.reverbBus, section, analysis, rootFrequency, scale);
    scheduleArp(offline, buses.musicBus, buses.delayBus, section, analysis, rootFrequency, scale);
    scheduleTransitions(offline, buses.fxBus, buses.reverbBus, section, analysis, index, arrangement.length);
  }

  return offline.startRendering();
}

async function buildCoverSong(songBuffer, vocalBuffer, analysis) {
  const sampleRate = 44100;
  const frameCount = Math.ceil(analysis.songLength * sampleRate);
  const offline = new OfflineAudioContext(2, frameCount, sampleRate);
  const arrangement = buildArrangement(analysis.songLength, analysis.bpm);
  const buses = createMixBuses(offline, Math.min(1, analysis.energy + 0.08), analysis.brightness);
  const rootFrequency = midiToFrequency(48 + analysis.keyIndex);
  const backingStem = extractSideBed(songBuffer);
  const guideStem = extractCenterChannel(songBuffer);
  const singerStem = extractCenterChannel(vocalBuffer);
  const singerLeadGain = computeSingerLeadGain(analysis.singerRms);

  placeFullTrack(offline, buses.musicBus, backingStem, {
    when: 0,
    offset: 0,
    duration: Math.min(backingStem.duration, analysis.instrumentalDuration, analysis.songLength),
    gainValue: 0.68,
    attack: 0.02,
    release: 0.2,
    filterType: "lowpass",
    filterFrequency: 7600,
  });

  placeFullTrack(offline, buses.sourceBus, guideStem, {
    when: 0,
    offset: 0,
    duration: Math.min(guideStem.duration, analysis.instrumentalDuration, analysis.songLength),
    gainValue: 0.03,
    attack: 0.02,
    release: 0.2,
    filterType: "bandpass",
    filterFrequency: 1800,
    q: 0.8,
    send: buses.vocalVerbBus,
    sendLevel: 0.08,
  });

  scheduleSingerLead(offline, buses.vocalBus, buses.vocalVerbBus, singerStem, {
    ...analysis,
    singerLeadGain,
  }, arrangement, rootFrequency);
  scheduleSingerDoubles(offline, buses.padBus, buses.delayBus, singerStem, analysis, arrangement, rootFrequency);
  addCoverGlue(offline, buses.fxBus, analysis, arrangement);

  return offline.startRendering();
}

function buildArrangement(songLength, bpm) {
  const barSeconds = (60 / bpm) * 4;
  const template = [
    { kind: "intro", bars: 4 },
    { kind: "verse", bars: 8 },
    { kind: "pre", bars: 4 },
    { kind: "chorus", bars: 8 },
    { kind: "verse", bars: 8 },
    { kind: "bridge", bars: 4 },
    { kind: "chorus", bars: 8 },
    { kind: "outro", bars: 4 },
  ];
  const arrangement = [];
  let cursor = 0;

  for (let i = 0; i < template.length; i += 1) {
    const block = template[i];
    const nominalDuration = block.bars * barSeconds;
    const remaining = songLength - cursor;
    if (remaining <= barSeconds * 2) {
      arrangement.push({ kind: block.kind, start: cursor, duration: Math.max(remaining, 2), bars: Math.max(1, Math.round(remaining / barSeconds)) });
      break;
    }
    arrangement.push({ kind: block.kind, start: cursor, duration: Math.min(nominalDuration, remaining), bars: block.bars });
    cursor += Math.min(nominalDuration, remaining);
  }

  return arrangement;
}

function createMixBuses(context, energy, brightness) {
  const drumBus = context.createGain();
  const bassBus = context.createGain();
  const musicBus = context.createGain();
  const sourceBus = context.createGain();
  const padBus = context.createGain();
  const leadBus = context.createGain();
  const vocalBus = context.createGain();
  const fxBus = context.createGain();
  const reverbBus = createConvolverBus(context, 2.4 + energy * 2, 0.28 + brightness * 0.1);
  const vocalVerbBus = createConvolverBus(context, 1.8 + energy * 1.5, 0.22);
  const delayBus = createFeedbackDelay(context, 0.24 + energy * 0.08, 0.2 + brightness * 0.1, 2400);

  drumBus.gain.value = 0.8;
  bassBus.gain.value = 0.82;
  musicBus.gain.value = 0.56;
  sourceBus.gain.value = 0.34;
  padBus.gain.value = 0.24;
  leadBus.gain.value = 0.16;
  vocalBus.gain.value = 1.28;
  fxBus.gain.value = 0.18;

  const sourceTone = context.createBiquadFilter();
  sourceTone.type = "lowpass";
  sourceTone.frequency.value = 2600 + brightness * 2600;

  const vocalPresence = context.createBiquadFilter();
  vocalPresence.type = "peaking";
  vocalPresence.frequency.value = 2400;
  vocalPresence.Q.value = 0.9;
  vocalPresence.gain.value = 3.4;

  const vocalHighpass = context.createBiquadFilter();
  vocalHighpass.type = "highpass";
  vocalHighpass.frequency.value = 115;
  vocalHighpass.Q.value = 0.7;

  const vocalAir = context.createBiquadFilter();
  vocalAir.type = "highshelf";
  vocalAir.frequency.value = 7200;
  vocalAir.gain.value = 2.2;

  const vocalLeveler = context.createDynamicsCompressor();
  vocalLeveler.threshold.value = -19;
  vocalLeveler.knee.value = 9;
  vocalLeveler.ratio.value = 3.2;
  vocalLeveler.attack.value = 0.004;
  vocalLeveler.release.value = 0.16;

  const glue = context.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.knee.value = 14;
  glue.ratio.value = 4;
  glue.attack.value = 0.01;
  glue.release.value = 0.2;

  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -9;
  limiter.knee.value = 18;
  limiter.ratio.value = 10;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;

  const masterGain = context.createGain();
  masterGain.gain.value = 0.92;

  sourceBus.connect(sourceTone);
  sourceTone.connect(glue);
  padBus.connect(glue);
  leadBus.connect(glue);
  drumBus.connect(glue);
  bassBus.connect(glue);
  musicBus.connect(glue);
  vocalBus.connect(vocalHighpass);
  vocalHighpass.connect(vocalPresence);
  vocalPresence.connect(vocalAir);
  vocalAir.connect(vocalLeveler);
  vocalLeveler.connect(glue);
  fxBus.connect(glue);
  reverbBus.output.connect(glue);
  vocalVerbBus.output.connect(glue);
  delayBus.output.connect(glue);

  glue.connect(limiter);
  limiter.connect(masterGain);
  masterGain.connect(context.destination);

  return {
    drumBus,
    bassBus,
    musicBus,
    sourceBus,
    padBus,
    leadBus,
    vocalBus,
    fxBus,
    reverbBus: reverbBus.input,
    vocalVerbBus: vocalVerbBus.input,
    delayBus: delayBus.input,
  };
}

function scheduleVocalTrack(context, destination, reverbBus, vocalBuffer, analysis, section, rootFrequency) {
  const beat = 60 / analysis.bpm;
  const slices = Math.max(4, section.bars * 2);
  const sourcePitch = Math.max(analysis.detectedPitch || rootFrequency, 1);
  const targetIntervals = analysis.mode === "major" ? [0, 4, 7, 9] : [0, 3, 7, 10];

  for (let i = 0; i < slices; i += 1) {
    const hotspot = pickHotspot(analysis.hotspots, i + section.start * 10);
    const targetHz = rootFrequency * semitoneRatio(targetIntervals[i % targetIntervals.length] + (section.kind === "chorus" ? 12 : 0));
    const rate = clamp(targetHz / sourcePitch, 0.82, 1.22);
    const offset = clamp(hotspot + (pseudoRandom(i * 21) - 0.5) * 0.25, 0, Math.max(vocalBuffer.duration - 0.75, 0));
    const duration = section.kind === "chorus" ? 0.75 : 0.52;
    const when = section.start + i * beat * 2;
    placeSourceSlice(context, destination, vocalBuffer, {
      when,
      offset,
      duration,
      gainValue: section.kind === "chorus" ? 0.3 : 0.24,
      rate,
      pan: 0,
      filterType: "bandpass",
      filterFrequency: 1850,
      q: 0.8,
      attack: 0.015,
      release: 0.09,
      send: reverbBus,
      sendLevel: 0.25,
    });
  }

  if (section.kind !== "intro") {
    const longStart = clamp(pickHotspot(analysis.hotspots, section.start * 20) - 0.15, 0, Math.max(vocalBuffer.duration - 1.4, 0));
    placeSourceSlice(context, destination, vocalBuffer, {
      when: section.start,
      offset: longStart,
      duration: Math.min(1.2, Math.max(vocalBuffer.duration - longStart, 0.35)),
      gainValue: section.kind === "chorus" ? 0.26 : 0.2,
      rate: clamp(rootFrequency / sourcePitch, 0.88, 1.15),
      pan: 0,
      filterType: "lowpass",
      filterFrequency: 4200,
      attack: 0.05,
      release: 0.35,
      playbackDuration: Math.min(section.duration, beat * 3.5),
      send: reverbBus,
      sendLevel: 0.2,
    });
  }
}

function scheduleSourceBed(context, destination, audioBuffer, analysis, section, sectionIndex) {
  const beat = 60 / analysis.bpm;
  const chunks = Math.max(4, section.bars * 2);

  for (let i = 0; i < chunks; i += 1) {
    const hotspot = pickHotspot(analysis.hotspots, sectionIndex + i);
    const marker = pseudoRandom(sectionIndex * 41 + i * 17);
    placeSourceSlice(context, destination, audioBuffer, {
      when: section.start + i * beat * 2,
      offset: clamp(hotspot + (marker - 0.5) * 0.7, 0, Math.max(audioBuffer.duration - 0.9, 0)),
      duration: clamp(0.3 + marker * 0.8, 0.22, 0.9),
      gainValue: 0.12 + analysis.energy * 0.06,
      rate: 0.92 + (marker - 0.5) * 0.1,
      pan: Math.sin((sectionIndex + i) * 1.43) * 0.4,
      filterType: "lowpass",
      filterFrequency: 1600 + analysis.brightness * 2600,
      attack: 0.018,
      release: 0.12,
    });
  }
}

function scheduleSourcePads(context, destination, reverbBus, audioBuffer, analysis, section, sectionIndex, rootFrequency) {
  const beat = 60 / analysis.bpm;
  const events = Math.max(2, Math.floor(section.duration / (beat * 4)));
  const sourcePitch = Math.max(analysis.detectedPitch || rootFrequency, 1);

  for (let i = 0; i < events; i += 1) {
    const marker = pseudoRandom(sectionIndex * 73 + i * 31);
    const interval = [0, 7, 12, 5][(sectionIndex + i) % 4];
    placeSourceSlice(context, destination, audioBuffer, {
      when: section.start + i * beat * 4,
      offset: clamp(pickHotspot(analysis.hotspots, sectionIndex + i * 2) - 0.2, 0, Math.max(audioBuffer.duration - 1.6, 0)),
      duration: clamp(0.8 + marker * 1.2, 0.7, 1.9),
      gainValue: 0.07,
      rate: clamp((rootFrequency * semitoneRatio(interval)) / sourcePitch, 0.72, 1.4),
      pan: Math.cos((sectionIndex + i) * 0.9) * 0.25,
      filterType: "lowpass",
      filterFrequency: 950 + analysis.brightness * 1500,
      attack: 0.3,
      release: 0.8,
      playbackDuration: Math.min(section.duration, beat * 4.1),
      send: reverbBus,
      sendLevel: 0.52,
    });
  }
}

function scheduleSourceLead(context, destination, delayBus, audioBuffer, analysis, section, sectionIndex, rootFrequency) {
  if (!["pre", "chorus", "bridge"].includes(section.kind)) {
    return;
  }

  const beat = 60 / analysis.bpm;
  const sourcePitch = Math.max(analysis.detectedPitch || rootFrequency, 1);

  for (let i = 0; i < Math.max(4, section.bars * 2); i += 1) {
    const marker = pseudoRandom(sectionIndex * 107 + i * 11);
    const interval = (analysis.mode === "major" ? [12, 7, 9, 4] : [12, 7, 10, 3])[i % 4];
    placeSourceSlice(context, destination, audioBuffer, {
      when: section.start + i * beat,
      offset: clamp(pickHotspot(analysis.hotspots, sectionIndex + i) + marker * 0.2, 0, Math.max(audioBuffer.duration - 0.55, 0)),
      duration: clamp(0.22 + marker * 0.26, 0.18, 0.5),
      gainValue: 0.06,
      rate: clamp((rootFrequency * semitoneRatio(interval)) / sourcePitch, 0.8, 1.7),
      pan: Math.sin(i * 2.1) * 0.3,
      filterType: "bandpass",
      filterFrequency: 1400 + marker * 2200,
      q: 2.8,
      attack: 0.01,
      release: 0.12,
      send: delayBus,
      sendLevel: 0.4,
    });
  }
}

function scheduleSingerLead(context, destination, reverbBus, audioBuffer, analysis, arrangement, rootFrequency) {
  const sourcePitch = Math.max(analysis.singerPitch || analysis.detectedPitch || rootFrequency, 1);
  const guideIntervals = analysis.mode === "major" ? [0, 4, 7, 9] : [0, 3, 7, 10];
  const naturalRate = analysis.singerCorrectionRatio || 1;
  const singerHotspots = analysis.singerHotspots?.length ? analysis.singerHotspots : analysis.hotspots;
  const singerLeadGain = analysis.singerLeadGain || 0.94;

  placeFullTrack(context, destination, audioBuffer, {
    when: 0,
    offset: 0,
    duration: Math.min(audioBuffer.duration, analysis.songLength),
    gainValue: singerLeadGain,
    rate: naturalRate,
    attack: 0.02,
    release: 0.45,
    filterType: "lowpass",
    filterFrequency: 11000,
    send: reverbBus,
    sendLevel: 0.09,
  });

  arrangement.forEach((section, sectionIndex) => {
    if (!["pre", "chorus", "bridge", "outro"].includes(section.kind)) {
      return;
    }

    const beat = 60 / analysis.bpm;
    const slices = Math.max(2, section.bars);

    for (let i = 0; i < slices; i += 1) {
      const hotspot = pickHotspot(singerHotspots, sectionIndex * 19 + i);
      const interval = guideIntervals[(i + sectionIndex) % guideIntervals.length] + (section.kind === "chorus" && i % 3 === 0 ? 12 : 0);
      const targetHz = rootFrequency * semitoneRatio(interval);
      placeSourceSlice(context, destination, audioBuffer, {
        when: section.start + i * beat * 2,
        offset: clamp(hotspot + (pseudoRandom(sectionIndex * 91 + i * 7) - 0.5) * 0.08, 0, Math.max(audioBuffer.duration - 0.9, 0)),
        duration: section.kind === "chorus" ? 0.48 : 0.38,
        gainValue: section.kind === "chorus" ? 0.05 : 0.028,
        rate: clamp(targetHz / sourcePitch, 0.97, 1.03),
        pan: Math.sin((sectionIndex + i) * 0.65) * 0.08,
        filterType: "lowpass",
        filterFrequency: 5200 + analysis.singerBrightness * 1600,
        attack: 0.02,
        release: 0.1,
        send: reverbBus,
        sendLevel: section.kind === "chorus" ? 0.12 : 0.08,
      });
    }
  });
}

function scheduleSingerDoubles(context, destination, delayBus, audioBuffer, analysis, arrangement, rootFrequency) {
  const sourcePitch = Math.max(analysis.singerPitch || analysis.detectedPitch || rootFrequency, 1);
  const singerHotspots = analysis.singerHotspots?.length ? analysis.singerHotspots : analysis.hotspots;

  arrangement.forEach((section, sectionIndex) => {
    if (!["pre", "chorus", "bridge", "outro"].includes(section.kind)) {
      return;
    }

    const beat = 60 / analysis.bpm;
    for (let i = 0; i < Math.max(3, section.bars); i += 1) {
      const marker = pseudoRandom(sectionIndex * 43 + i * 17);
      const harmony = analysis.mode === "major" ? [7, 12, 4] : [7, 12, 3];
      const targetHz = rootFrequency * semitoneRatio(harmony[i % harmony.length]);
      placeSourceSlice(context, destination, audioBuffer, {
        when: section.start + i * beat * 2,
        offset: clamp(pickHotspot(singerHotspots, sectionIndex + i * 2) + marker * 0.1, 0, Math.max(audioBuffer.duration - 0.7, 0)),
        duration: 0.36 + marker * 0.12,
        gainValue: 0.02,
        rate: clamp(targetHz / sourcePitch, 0.98, 1.02),
        pan: i % 2 === 0 ? -0.25 : 0.25,
        filterType: "bandpass",
        filterFrequency: 2400 + marker * 900,
        q: 1.3,
        attack: 0.02,
        release: 0.16,
        send: delayBus,
        sendLevel: 0.08,
      });
    }
  });
}

function addCoverGlue(context, destination, analysis, arrangement) {
  arrangement.forEach((section, sectionIndex) => {
    if (!["pre", "chorus", "bridge"].includes(section.kind)) {
      return;
    }

    const lift = context.createGain();
    lift.gain.setValueAtTime(0.0001, section.start);
    lift.gain.linearRampToValueAtTime(0.035 + analysis.energy * 0.02, section.start + 0.4);
    lift.gain.exponentialRampToValueAtTime(0.0001, section.start + Math.min(section.duration, 1.8));
    lift.connect(destination);

    const osc = context.createOscillator();
    osc.type = sectionIndex % 2 === 0 ? "triangle" : "sine";
    osc.frequency.setValueAtTime(analysis.mode === "major" ? 640 : 520, section.start);
    osc.frequency.exponentialRampToValueAtTime(analysis.mode === "major" ? 280 : 240, section.start + Math.min(section.duration, 1.8));
    osc.connect(lift);
    osc.start(section.start);
    osc.stop(section.start + Math.min(section.duration, 1.8));
  });
}

function scheduleDrums(context, destination, section, analysis) {
  const beat = 60 / analysis.bpm;
  const sixteenth = beat / 4;

  for (let bar = 0; bar < section.bars; bar += 1) {
    const barStart = section.start + bar * beat * 4;
    for (let step = 0; step < 16; step += 1) {
      const time = barStart + step * sixteenth + (step % 2 ? analysis.preset.swing * sixteenth : 0);
      const accent = analysis.preset.accentPattern[step % analysis.preset.accentPattern.length];
      if (analysis.style === "house") {
        if (step % 4 === 0) makeKick(context, destination, time, 0.76 + analysis.energy * 0.24);
      } else if (step === 0 || step === 8 || (section.kind === "chorus" && step === 12)) {
        makeKick(context, destination, time, 0.7 + analysis.energy * 0.24);
      }
      if (step === 4 || step === 12) makeSnare(context, destination, time, 0.16 + analysis.energy * 0.14, analysis.style);
      if (step % 2 === 0) makeHat(context, destination, time, 0.024 + accent * 0.03 + analysis.energy * 0.018, analysis.style);
      if (analysis.style === "trap" && step % 3 === 0) makeHat(context, destination, time + sixteenth / 2, 0.02 + analysis.energy * 0.01, analysis.style, 0.028);
    }
  }
}

function scheduleBass(context, destination, section, analysis, rootFrequency, scale) {
  const beat = 60 / analysis.bpm;
  for (let bar = 0; bar < section.bars; bar += 1) {
    const degree = analysis.preset.progression[bar % analysis.preset.progression.length] % scale.length;
    const noteA = rootFrequency * semitoneRatio(scale[degree] - 12);
    const noteB = rootFrequency * semitoneRatio(scale[(degree + 2) % scale.length] - 12);
    const barStart = section.start + bar * beat * 4;
    for (let beatIndex = 0; beatIndex < 4; beatIndex += 1) {
      synthBass(context, destination, {
        when: barStart + beatIndex * beat,
        duration: beat * 0.92,
        frequency: beatIndex === 2 ? noteB : noteA,
        wave: analysis.preset.bassWave,
        gain: 0.075 + analysis.energy * 0.06,
        filter: 180 + analysis.energy * 420 + analysis.brightness * 140,
      });
    }
  }
}

function scheduleHarmony(context, destination, reverbBus, section, analysis, rootFrequency, scale) {
  const beat = 60 / analysis.bpm;
  for (let bar = 0; bar < section.bars; bar += 1) {
    const degree = analysis.preset.progression[bar % analysis.preset.progression.length] % scale.length;
    const triad = buildChord(scale, degree);
    const when = section.start + bar * beat * 4;
    triad.forEach((interval, index) => {
      synthChordVoice(context, destination, reverbBus, {
        when,
        duration: beat * 3.7,
        frequency: rootFrequency * semitoneRatio(interval),
        wave: analysis.preset.chordWave,
        gain: 0.026 + analysis.energy * 0.018 - index * 0.002,
        filter: 850 + analysis.brightness * 1800 + index * 170,
      });
    });
  }
}

function scheduleArp(context, destination, delayBus, section, analysis, rootFrequency, scale) {
  if (!["chorus", "pre", "outro"].includes(section.kind)) return;
  const beat = 60 / analysis.bpm;
  for (let bar = 0; bar < section.bars; bar += 1) {
    const degree = analysis.preset.progression[bar % analysis.preset.progression.length] % scale.length;
    const chord = buildChord(scale, degree);
    const barStart = section.start + bar * beat * 4;
    for (let step = 0; step < 8; step += 1) {
      synthPluck(context, destination, delayBus, {
        when: barStart + step * (beat / 2),
        duration: beat * 0.34,
        frequency: rootFrequency * semitoneRatio(chord[step % chord.length] + (step > 4 ? 12 : 0)),
        gain: 0.012 + analysis.energy * 0.012,
      });
    }
  }
}

function scheduleTransitions(context, destination, reverbBus, section, analysis, sectionIndex, totalSections) {
  if (sectionIndex >= totalSections - 1) return;
  const end = section.start + section.duration;
  makeNoiseRiser(context, destination, reverbBus, end - Math.min(2.6, section.duration * 0.35), Math.min(2.6, section.duration * 0.35), 0.03 + analysis.energy * 0.02);
  if (section.kind === "bridge" || section.kind === "pre") makeImpact(context, destination, end - 0.04, 0.15 + analysis.energy * 0.08);
}

function placeSourceSlice(context, destination, audioBuffer, options) {
  const {
    when, offset, duration, gainValue, rate, pan, filterType, filterFrequency, q = 0.7,
    attack = 0.02, release = 0.15, playbackDuration = duration, send, sendLevel = 0,
  } = options;
  const audibleDuration = Math.max(playbackDuration / Math.max(rate || 1, 0.01), attack + release);

  const source = context.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.value = rate;

  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFrequency, when);
  filter.Q.value = q;

  const gain = context.createGain();
  const panner = context.createStereoPanner();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(Math.max(gainValue, 0.0001), when + attack);
  gain.gain.setValueAtTime(Math.max(gainValue, 0.0001), when + Math.max(attack, audibleDuration - release));
  gain.gain.exponentialRampToValueAtTime(0.0001, when + audibleDuration);
  panner.pan.value = pan;

  source.connect(filter);
  filter.connect(gain);
  gain.connect(panner);
  panner.connect(destination);

  if (send && sendLevel > 0) {
    const sendGain = context.createGain();
    sendGain.gain.value = sendLevel;
    gain.connect(sendGain);
    sendGain.connect(send);
  }

  source.start(when, offset, duration);
}

function placeFullTrack(context, destination, audioBuffer, options) {
  const {
    when,
    offset = 0,
    duration = audioBuffer.duration,
    gainValue,
    rate = 1,
    pan = 0,
    filterType = "lowpass",
    filterFrequency = 9000,
    q = 0.7,
    attack = 0.02,
    release = 0.15,
    send,
    sendLevel = 0,
  } = options;

  placeSourceSlice(context, destination, audioBuffer, {
    when,
    offset,
    duration,
    playbackDuration: Math.max(duration, attack + release + 0.01),
    gainValue,
    rate,
    pan,
    filterType,
    filterFrequency,
    q,
    attack,
    release,
    send,
    sendLevel,
  });
}

function synthBass(context, destination, options) {
  const { when, duration, frequency, wave, gain, filter } = options;
  const oscA = context.createOscillator();
  const oscB = context.createOscillator();
  const lowpass = context.createBiquadFilter();
  const amp = context.createGain();
  oscA.type = wave;
  oscB.type = wave === "sine" ? "triangle" : wave;
  oscA.frequency.setValueAtTime(frequency, when);
  oscB.frequency.setValueAtTime(frequency * 0.997, when);
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(filter, when);
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.linearRampToValueAtTime(gain, when + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscA.connect(lowpass);
  oscB.connect(lowpass);
  lowpass.connect(amp);
  amp.connect(destination);
  oscA.start(when);
  oscB.start(when);
  oscA.stop(when + duration + 0.06);
  oscB.stop(when + duration + 0.06);
}

function synthChordVoice(context, destination, reverbBus, options) {
  const { when, duration, frequency, wave, gain, filter } = options;
  const oscA = context.createOscillator();
  const oscB = context.createOscillator();
  const tone = context.createBiquadFilter();
  const amp = context.createGain();
  oscA.type = wave;
  oscB.type = wave;
  oscA.frequency.setValueAtTime(frequency, when);
  oscB.frequency.setValueAtTime(frequency * 1.004, when);
  tone.type = "lowpass";
  tone.frequency.setValueAtTime(filter, when);
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.linearRampToValueAtTime(gain, when + 0.16);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + duration + 0.8);
  oscA.connect(tone);
  oscB.connect(tone);
  tone.connect(amp);
  amp.connect(destination);
  const send = context.createGain();
  send.gain.value = 0.42;
  amp.connect(send);
  send.connect(reverbBus);
  oscA.start(when);
  oscB.start(when);
  oscA.stop(when + duration + 0.9);
  oscB.stop(when + duration + 0.9);
}

function synthPluck(context, destination, delayBus, options) {
  const { when, duration, frequency, gain } = options;
  const osc = context.createOscillator();
  const bright = context.createBiquadFilter();
  const amp = context.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(frequency, when);
  bright.type = "bandpass";
  bright.frequency.setValueAtTime(frequency * 2.2, when);
  bright.Q.value = 2.3;
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(gain, when + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(bright);
  bright.connect(amp);
  amp.connect(destination);
  const send = context.createGain();
  send.gain.value = 0.46;
  amp.connect(send);
  send.connect(delayBus);
  osc.start(when);
  osc.stop(when + duration + 0.04);
}

function makeKick(context, destination, when, gainValue) {
  const osc = context.createOscillator();
  const click = context.createBufferSource();
  const clickBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.012), context.sampleRate);
  const clickData = clickBuffer.getChannelData(0);
  const lowpass = context.createBiquadFilter();
  const amp = context.createGain();
  const clickGain = context.createGain();
  for (let i = 0; i < clickData.length; i += 1) clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * 0.002));
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, when);
  osc.frequency.exponentialRampToValueAtTime(46, when + 0.16);
  lowpass.type = "lowpass";
  lowpass.frequency.value = 950;
  amp.gain.setValueAtTime(gainValue, when);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
  click.buffer = clickBuffer;
  clickGain.gain.setValueAtTime(gainValue * 0.23, when);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.018);
  osc.connect(lowpass);
  lowpass.connect(amp);
  amp.connect(destination);
  click.connect(clickGain);
  clickGain.connect(destination);
  osc.start(when);
  click.start(when);
  osc.stop(when + 0.2);
}

function makeSnare(context, destination, when, gainValue, style, tail = 0.2) {
  const noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.25), context.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) channel[i] = (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * 0.055));
  const noise = context.createBufferSource();
  const tone = context.createOscillator();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  const toneGain = context.createGain();
  noise.buffer = noiseBuffer;
  noiseFilter.type = style === "lo-fi" ? "bandpass" : "highpass";
  noiseFilter.frequency.value = style === "lo-fi" ? 1800 : 1500;
  tone.type = "triangle";
  tone.frequency.setValueAtTime(style === "trap" ? 230 : 190, when);
  tone.frequency.exponentialRampToValueAtTime(120, when + 0.08);
  noiseGain.gain.setValueAtTime(gainValue, when);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + tail);
  toneGain.gain.setValueAtTime(gainValue * 0.45, when);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(destination);
  tone.connect(toneGain);
  toneGain.connect(destination);
  noise.start(when);
  tone.start(when);
  tone.stop(when + 0.14);
}

function makeHat(context, destination, when, gainValue, style, duration = 0.05) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) channel[i] = (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * 0.01));
  const source = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  highpass.type = "highpass";
  highpass.frequency.value = style === "lo-fi" ? 4400 : 6500;
  gain.gain.setValueAtTime(gainValue, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  source.connect(highpass);
  highpass.connect(gain);
  gain.connect(destination);
  source.start(when);
}

function makeNoiseRiser(context, destination, reverbBus, when, duration, gainValue) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) channel[i] = (Math.random() * 2 - 1) * Math.pow(i / channel.length, 2);
  const source = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const gain = context.createGain();
  const send = context.createGain();
  source.buffer = buffer;
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(500, when);
  highpass.frequency.linearRampToValueAtTime(5800, when + duration);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(gainValue, when + duration * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  send.gain.value = 0.5;
  source.connect(highpass);
  highpass.connect(gain);
  gain.connect(destination);
  gain.connect(send);
  send.connect(reverbBus);
  source.start(when);
}

function makeImpact(context, destination, when, gainValue) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(90, when);
  osc.frequency.exponentialRampToValueAtTime(38, when + 0.25);
  gain.gain.setValueAtTime(gainValue, when);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(when);
  osc.stop(when + 0.38);
}

function createConvolverBus(context, seconds, decay) {
  const length = Math.floor(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  const input = context.createGain();
  const convolver = context.createConvolver();
  const tone = context.createBiquadFilter();
  const output = context.createGain();
  convolver.buffer = impulse;
  tone.type = "lowpass";
  tone.frequency.value = 4200;
  output.gain.value = 0.3;
  input.connect(convolver);
  convolver.connect(tone);
  tone.connect(output);
  return { input, output };
}

function createFeedbackDelay(context, time, feedbackAmount, lowpassFreq) {
  const input = context.createGain();
  const output = context.createGain();
  const delay = context.createDelay(1.2);
  const feedback = context.createGain();
  const tone = context.createBiquadFilter();
  delay.delayTime.value = time;
  feedback.gain.value = feedbackAmount;
  tone.type = "lowpass";
  tone.frequency.value = lowpassFreq;
  output.gain.value = 0.24;
  input.connect(delay);
  delay.connect(tone);
  tone.connect(feedback);
  feedback.connect(delay);
  tone.connect(output);
  return { input, output };
}

function extractCenterChannel(audioBuffer) {
  const output = new AudioBuffer({ length: audioBuffer.length, numberOfChannels: 2, sampleRate: audioBuffer.sampleRate });
  if (audioBuffer.numberOfChannels === 1) {
    const data = audioBuffer.getChannelData(0);
    output.copyToChannel(data, 0);
    output.copyToChannel(data, 1);
    return output;
  }

  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);
  const centerL = new Float32Array(audioBuffer.length);
  const centerR = new Float32Array(audioBuffer.length);
  for (let i = 0; i < audioBuffer.length; i += 1) {
    const center = (left[i] + right[i]) * 0.5;
    centerL[i] = center;
    centerR[i] = center;
  }
  output.copyToChannel(centerL, 0);
  output.copyToChannel(centerR, 1);
  return output;
}

function extractSideBed(audioBuffer) {
  if (audioBuffer.numberOfChannels < 2) {
    return audioBuffer;
  }
  const output = new AudioBuffer({ length: audioBuffer.length, numberOfChannels: 2, sampleRate: audioBuffer.sampleRate });
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);
  const outL = new Float32Array(audioBuffer.length);
  const outR = new Float32Array(audioBuffer.length);
  for (let i = 0; i < audioBuffer.length; i += 1) {
    const center = (left[i] + right[i]) * 0.5;
    outL[i] = left[i] - center * 0.55;
    outR[i] = right[i] - center * 0.55;
  }
  output.copyToChannel(outL, 0);
  output.copyToChannel(outR, 1);
  return output;
}

function mixToMono(audioBuffer) {
  const mono = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let i = 0; i < mono.length; i += 1) mono[i] += data[i] / audioBuffer.numberOfChannels;
  }
  return mono;
}

function computeRms(data) {
  let sumSquares = 0;
  for (let i = 0; i < data.length; i += 1) sumSquares += data[i] * data[i];
  return Math.sqrt(sumSquares / Math.max(data.length, 1));
}

function sampleEnvelope(data, sampleRate, framesPerSecond) {
  const step = Math.max(1, Math.floor(sampleRate / framesPerSecond));
  const envelope = [];
  for (let i = 0; i < data.length; i += step) {
    const end = Math.min(data.length, i + step);
    let sum = 0;
    for (let j = i; j < end; j += 1) sum += Math.abs(data[j]);
    envelope.push(sum / Math.max(end - i, 1));
  }
  return envelope;
}

function estimateBrightness(data, sampleRate) {
  const maxWindow = Math.min(data.length, sampleRate * 3);
  let low = 0;
  let high = 0;
  for (let i = 1; i < maxWindow; i += 1) {
    high += Math.abs(data[i] - data[i - 1]);
    low += Math.abs(data[i]);
  }
  return clamp(high / Math.max(low, 1e-5), 0, 1);
}

function estimateSpectralCentroid(data, sampleRate) {
  const size = Math.min(nextPowerOfTwo(Math.floor(sampleRate * 0.05)), data.length);
  const slice = data.subarray(0, size);
  let weighted = 0;
  let total = 0;
  for (let k = 1; k < Math.floor(size / 2); k += 1) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < slice.length; n += 1) {
      const phase = (2 * Math.PI * k * n) / slice.length;
      real += slice[n] * Math.cos(phase);
      imag -= slice[n] * Math.sin(phase);
    }
    const magnitude = Math.sqrt(real * real + imag * imag);
    weighted += ((k * sampleRate) / slice.length) * magnitude;
    total += magnitude;
  }
  return clamp((weighted / Math.max(total, 1)) / 5000, 0, 1);
}

function estimatePulse(envelope) {
  if (envelope.length < 4) return 0.5;
  let pulse = 0;
  let total = 0;
  for (let i = 2; i < envelope.length; i += 1) {
    pulse += Math.max(0, envelope[i] - envelope[i - 1]) * (i % 2 === 0 ? 1 : 0.8);
    total += envelope[i];
  }
  return clamp(pulse / Math.max(total, 1e-5), 0, 1);
}

function findLoudestWindow(data, sampleRate, seconds) {
  const size = Math.min(data.length, Math.floor(sampleRate * seconds));
  let bestStart = 0;
  let bestValue = -Infinity;
  let windowSum = 0;
  for (let i = 0; i < size; i += 1) windowSum += Math.abs(data[i]);
  bestValue = windowSum;
  for (let i = size; i < data.length; i += 1) {
    windowSum += Math.abs(data[i]) - Math.abs(data[i - size]);
    if (windowSum > bestValue) {
      bestValue = windowSum;
      bestStart = i - size + 1;
    }
  }
  return { start: bestStart, end: bestStart + size };
}

function estimatePitchAutocorrelation(data, sampleRate) {
  const minLag = Math.floor(sampleRate / 800);
  const maxLag = Math.floor(sampleRate / 70);
  let bestLag = -1;
  let bestCorrelation = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    for (let i = 0; i < data.length - lag; i += 1) correlation += data[i] * data[i + lag];
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }
  return bestLag > 0 && bestCorrelation >= 0.01 ? sampleRate / bestLag : NaN;
}

function findHotspots(envelope, durationSeconds) {
  if (!envelope.length) return [0.2, 0.8, 1.4];
  return envelope
    .map((value, index) => ({ value, time: (index / envelope.length) * durationSeconds }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 16)
    .map((entry) => entry.time)
    .sort((a, b) => a - b);
}

function pickHotspot(hotspots, seed) {
  return hotspots.length ? hotspots[Math.abs(Math.floor(seed)) % hotspots.length] : 0;
}

function frequencyToPitchClass(frequency) {
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  return ((midi % 12) + 12) % 12;
}

function buildChord(scale, degree) {
  return [
    scale[degree % scale.length],
    scale[(degree + 2) % scale.length] + (degree + 2 >= scale.length ? 12 : 0),
    scale[(degree + 4) % scale.length] + (degree + 4 >= scale.length ? 12 : 0),
  ];
}

function audioBufferToWav(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = interleave(audioBuffer);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function interleave(audioBuffer) {
  if (audioBuffer.numberOfChannels === 1) return audioBuffer.getChannelData(0);
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);
  const interleaved = new Float32Array(left.length * 2);
  let index = 0;
  for (let i = 0; i < left.length; i += 1) {
    interleaved[index++] = left[i];
    interleaved[index++] = right[i];
  }
  return interleaved;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i += 1) view.setUint8(offset + i, string.charCodeAt(i));
}

function setStatus(index, state) {
  const statusCopy = [
    "Both takes ready",
    "Song and vocal trimmed for the render",
    "Song key and stem split estimated",
    "Your vocal is being tuned and blended",
    "Cover WAV prepared",
  ];
  statusItems.forEach((item, itemIndex) => {
    item.classList.remove("pending", "active", "complete");
    item.classList.add(itemIndex < index ? "complete" : "pending");
  });
  if (statusItems[index]) {
    statusItems[index].classList.remove("pending", "complete");
    statusItems[index].classList.add(state);
    statusItems[index].textContent = statusCopy[index];
  }
}

function resetStatus() {
  statusItems.forEach((item) => {
    item.className = "pending";
    item.textContent = item.dataset.cover || item.textContent;
  });
}

function buildCoverName(songName, singerName) {
  const cleanedSong = songName.replace(/\.[^.]+$/, "").trim() || "Untitled song";
  const cleanedSinger = singerName.replace(/\.[^.]+$/, "").trim() || "Singer";
  return `${cleanedSinger} sings ${cleanedSong}`;
}

function resolveCoverRenderDuration(songDuration, vocalDuration, tailPadding) {
  const instrumentalDuration = Math.min(songDuration, MAX_SOURCE_SECONDS);
  const vocalTailLimit = Math.min(vocalDuration, instrumentalDuration + tailPadding, MAX_SOURCE_SECONDS);
  return Math.max(instrumentalDuration, vocalTailLimit);
}

function computeGentleCorrectionRatio(singerPitch, songKeyIndex, mode) {
  if (!Number.isFinite(singerPitch) || singerPitch <= 0) {
    return 1;
  }

  const singerMidi = 69 + 12 * Math.log2(singerPitch / 440);
  const scale = mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  let nearestDistance = Infinity;

  for (let octave = -1; octave <= 1; octave += 1) {
    for (const degree of scale) {
      const targetPitchClass = (songKeyIndex + degree) % 12;
      const targetMidi = Math.round(singerMidi / 12) * 12 + targetPitchClass + octave * 12;
      const distance = targetMidi - singerMidi;
      if (Math.abs(distance) < Math.abs(nearestDistance)) {
        nearestDistance = distance;
      }
    }
  }

  const appliedShift = clamp(nearestDistance * 0.45, -0.45, 0.45);
  return semitoneRatio(appliedShift);
}

function computeSingerLeadGain(rms) {
  if (!Number.isFinite(rms) || rms <= 0) {
    return 0.92;
  }
  return clamp(0.18 / rms, 0.72, 1.08);
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

async function saveSongRecord(record) {
  const db = await openSongDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function semitoneRatio(semitones) {
  return Math.pow(2, semitones / 12);
}

function midiToFrequency(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function nextPowerOfTwo(value) {
  return 1 << Math.ceil(Math.log2(Math.max(value, 2)));
}

function pseudoRandom(seed) {
  const x = Math.sin(seed * 91.123) * 43758.5453;
  return x - Math.floor(x);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function breathe() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

renderModeHint();
resetStatus();

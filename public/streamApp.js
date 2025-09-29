/* ---------- Config ---------- */
const API_BASE = "https://uzumaki.fly.dev";

const MUST_RESOLVE_FIRST = true;
const CATALOG_API = API_BASE + "/api/animes";

const LOAD_DELAY_MS = 500;


function setupAriaRegions() {
  // Définir les régions principales
  const regions = [
    { selector: 'header', role: 'banner', label: 'Navigation principale' },
    { selector: 'main', role: 'main', label: 'Contenu principal' },
    { selector: '#browser', role: 'complementary', label: 'Navigateur d\'épisodes' },
    { selector: '#player-overlay', role: 'region', label: 'Lecteur vidéo' },
    { selector: '.resume-wrap', role: 'region', label: 'Reprendre la lecture' },
    { selector: '.episodes-footer', role: 'region', label: 'Liste des épisodes' },
  ];
  
  regions.forEach(({ selector, role, label }) => {
    const element = document.querySelector(selector);
    if (element) {
      element.setAttribute('role', role);
      element.setAttribute('aria-label', label);
    }
  });
  
  // Ajouter les live regions pour les messages
  const errorContainers = document.querySelectorAll('.error-message, #error-container');
  errorContainers.forEach(container => {
    container.setAttribute('role', 'alert');
    container.setAttribute('aria-live', 'assertive');
  });
  
  // Loading indicators
  const loadingElements = document.querySelectorAll('.loading-indicator, .loading-spinner');
  loadingElements.forEach(el => {
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Chargement en cours');
  });
}

// Appeler au DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  setupAriaRegions();
});

/* ---------- Helpers ---------- */
const normalizeLang = (l) => {
  const str = String(l || "vostfr").toLowerCase();
  if (str.includes("vost")) return "vostfr";
  if (str === "vf" || str.includes("dub")) return "vf";
  return "vostfr";
};

const normalizeSeason = (v) => {
  const s = String(v ?? "1").toLowerCase();
  if (s === "film") return "1";
  const m = s.match(/\d+/);
  return m ? m[0] : "1";
};

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60) || 0;
  const secs = Math.floor(seconds % 60) || 0;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

function showError(message, container = null) {
  console.error(message);
  if (container)
    container.innerHTML = `<div class="error-message">${message}</div>`;
  else alert(message);
}

// =================== NOUVEAUX HELPERS POUR HOSTS PRIVILÉGIÉS ===================
function isPreferredHost(u = "") {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
    return (
      h.endsWith("sibnet.ru") ||
      h.endsWith("sendvid.com") ||
      h.endsWith("videos2.sendvid.com") ||
      h.endsWith("sandvid.com") ||
      h.endsWith("sandvide.com")
    );
  } catch {
    return false;
  }
}

function splitByPreference(urls = []) {
  const preferred = [];
  const others = [];
  for (const u of urls) (isPreferredHost(u) ? preferred : others).push(u);
  return { preferred, others };
}

function mountEmbedInteractor({ overlayRoot, urls = [] }) {
  if (!overlayRoot) throw new Error("overlayRoot est requis");
  const containerId = "tv-embed-interactor";
  let container = overlayRoot.querySelector(`#${containerId}`);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    Object.assign(container.style, {
      position: "absolute",
      inset: 0,
      background: "#000",
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      alignItems: "center",
      justifyContent: "center",
      padding: "12px",
    });
    overlayRoot.appendChild(container);
  } else {
    container.innerHTML = "";
  }

  const controls = document.createElement("div");
  Object.assign(controls.style, {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    zIndex: 3,
  });
  const btnPrev = Object.assign(document.createElement("button"), {
    textContent: "◀",
  });
  const btnPlay = Object.assign(document.createElement("button"), {
    textContent: "Lire l'embed",
  });
  const btnNext = Object.assign(document.createElement("button"), {
    textContent: "▶",
  });
  for (const b of [btnPrev, btnPlay, btnNext])
    Object.assign(b.style, {
      fontSize: "14px",
      padding: "8px 12px",
      borderRadius: "8px",
    });
  const indicator = Object.assign(document.createElement("span"), {
    style: "color:#ddd;font-family:monospace",
  });
  controls.append(btnPrev, btnPlay, btnNext, indicator);

  const iframe = document.createElement("iframe");
  iframe.id = "tv-embed-frame";
  Object.assign(iframe.style, {
    width: "100%",
    height: "100%",
    border: 0,
    flex: "1 1 auto",
    zIndex: 1,
  });
  // 🔒 Popups bloquées (pas de allow-popups), autorisations minimales
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-presentation")
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");

  container.append(controls, iframe);

  let idx = 0;
  const N = urls.length;
  function updateIndicator() {
    indicator.textContent = N
      ? `${idx + 1}/${N} — ${(() => {
          try {
            return new URL(urls[idx]).hostname;
          } catch {
            return "";
          }
        })()}`
      : "Aucun embed";
  }
  setSrc(0)
async function setSrc(i) {
  if (!N) return;
  idx = (i + N) % N;
  
  // Chargement direct sans proxy
  iframe.src = urls[idx];
  
  updateIndicator();
}
  btnPrev.addEventListener("click", () => setSrc(idx - 1));
  btnNext.addEventListener("click", () => setSrc(idx + 1));
  btnPlay.addEventListener("click", () => setSrc(idx));
  updateIndicator();
if (urls.length > 0) setSrc(0)
  return {
    setUrls(newUrls = []) {
      urls = newUrls.slice();
      idx = 0;
      iframe.removeAttribute("src");
      updateIndicator();
    },
    destroy() {
      container.remove();
    },
  };
}

// Simple in-memory cache for details
const detailsCache = new Map();
const DETAILS_TTL = 6 * 60 * 60 * 1000;
const keyOf = (slug, season, lang) => `${slug}_${season}_${lang}`;
const getCached = (k) => {
  const v = detailsCache.get(k);
  if (!v) return null;
  if (Date.now() - v.ts > DETAILS_TTL) {
    detailsCache.delete(k);
    return null;
  }
  return v.data;
};

// Parse episode context (simplifiÃ©)
function parseEpisodeContext(idOrNull, fallback = {}) {
  const ctx = { animeId: null, lang: null, epNum: null, ...fallback };
  if (!idOrNull) return ctx;

  const m1 = idOrNull.match(/^([^:]+):e(\d+)$/i);
  const m2 = idOrNull.match(/^([^:]+):.*?episode[_-]?(\d+)$/i);
  if (m1) {
    ctx.animeId = m1[1];
    ctx.epNum = parseInt(m1[2], 10);
  } else if (m2) {
    ctx.animeId = m2[1];
    ctx.epNum = parseInt(m2[2], 10);
  } else {
    const i = idOrNull.indexOf(":");
    ctx.animeId = i >= 0 ? idOrNull.slice(0, i) : idOrNull;
  }
  return ctx;
}

function normalizeEmbedUrls(sources = []) {
  const out = [];
  for (const s of sources) {
    if (!s) continue;
    if (typeof s === "string") {
      out.push(s);
      continue;
    }
    if (typeof s === "object") {
      const u = s.url || s.src || s.href || "";
      if (u) out.push(u);
    }
  }
  return Array.from(new Set(out));
}

async function loadEmbedsFromDetails(animeId, lang = "VOSTFR", epNum = 1) {
  if (!animeId || !epNum) return [];
  try {
    const details = await fetchDetails(animeId, "1", lang);
    const actualData = details.data || details;
    const L = String(lang || "VOSTFR").toUpperCase();
    const key = `episode_${epNum}`;
    const arr = actualData?.episodes?.find((ep) => (ep.number || 1) === epNum);
    if (!arr) return [];
    return normalizeEmbedUrls(arr.sources || []);
  } catch {
    return [];
  }
}

/* ---------- State Management ---------- */
const overlayEl = document.getElementById("player-overlay");
const tvVideo = document.getElementById("tv-video");
const playerTitleEl = document.getElementById("player-title");
const playerSubtitleEl = document.getElementById("player-subtitle");
const playerEpisodesScroll = document.getElementById("player-episodes-scroll");
const playerSeasonSel = document.getElementById("player-season-select");
const playerLangChips = document.getElementById("player-lang-chips");

let currentPlayerState = {
  slug: null,
  title: "",
  season: "1",
  lang: "vostfr",
  episodes: [],
  currentEpisodeIndex: 0,
};

const browserEl = document.getElementById("browser");
const brTitle = document.getElementById("br-title");
const seasonSel = document.getElementById("br-season");
const langContainer = document.getElementById("br-lang");
const epRow = document.getElementById("ep-row");
const errorContainer = document.getElementById("error-container");
const closeBtn = document.getElementById("browser-close");

const browserState = {
  slug: null,
  title: "",
  season: "1",
  lang: "vostfr",
  episodes: [],
  availableSeasons: [],
  availableLanguages: [],
};

/* ---------- Smart Player Class (AUTOPLAY SUPPRIMÉ) ---------- */
class UzumakiSmartPlayer {
  constructor() {
    this.container = document.getElementById("smartPlayer");
    this.video = document.getElementById("tv-video");
    this.hls = null;
    this.isPlaying = false;
    this.currentSource = null;
    this.inactivityTimer = null;
    this.controlsVisible = true;

    this.elements = {
      loadingIndicator: document.getElementById("loadingIndicator"),
      errorMessage: document.getElementById("errorMessage"),
      errorText: document.getElementById("errorText"),
      videoInfo: document.getElementById("videoInfo"),
      videoTitle: document.getElementById("player-title"),
      videoSubtitle: document.getElementById("player-subtitle"),
      controlsOverlay: document.getElementById("controlsOverlay"),
      progressContainer: document.getElementById("progressContainer"),
      progressBar: document.getElementById("video-progress"),
      progressBuffer: document.getElementById("progressBuffer"),
      currentTime: document.getElementById("current-time"),
      totalTime: document.getElementById("total-time"),
      playPauseBtn: document.getElementById("play-pause-btn"),
      rewindBtn: document.getElementById("rewind-btn"),
      forwardBtn: document.getElementById("forward-btn"),
      muteBtn: document.getElementById("volume-btn"),
      volumeSlider: document.getElementById("volumeSlider"),
      nextBtn: document.getElementById("next-btn"),
      fullscreenBtn: document.getElementById("fullscreen-btn"),
      closeBtn: document.getElementById("player-close"),
    };

    this.init();
  }

  init() {
    // ❌ SUPPRIMÉ: this.setupAutoplayOptimizations();
    this.setupEventListeners();
    this.setupKeyboardNavigation();
    this.startInactivityTimer();
    // ❌ SUPPRIMÉ: this.prepareAudioContext();
  }

  setupEventListeners() {
    // Video events basiques (sans autoplay agressif)
    this.video.addEventListener("loadstart", () => {
      this.showLoading();
      console.log("[VIDEO] Chargement démarré");
    });
this.video.addEventListener("volumechange", () => {
  const vol = Math.round((this.video.volume || 0) * 100);
  if (this.elements.volumeSlider) {
    this.elements.volumeSlider.value = vol;
  }
  this.updateMuteButton();
});
if (this.elements.volumeSlider) {
  this.elements.volumeSlider.value = Math.round((this.video.volume || 0) * 100);
}
this.updateMuteButton();

    this.video.addEventListener("loadeddata", () => {
      this.hideLoading();
      console.log("[VIDEO] Données chargées");
    });

    this.video.addEventListener("canplay", () => {
      this.hideLoading();
      console.log("[VIDEO] Peut jouer");
    });

    this.video.addEventListener("playing", () => {
      this.isPlaying = true;
      this.elements.playPauseBtn.innerHTML = "⏸️";
      this.hideLoading();
      console.log("[VIDEO] Lecture démarrée");
    });

    this.video.addEventListener("pause", () => {
      this.isPlaying = false;
      this.elements.playPauseBtn.innerHTML = "▶️";
      console.log("[VIDEO] En pause");
    });

    this.video.addEventListener("ended", () => {
      this.isPlaying = false;
      this.elements.playPauseBtn.innerHTML = "▶️";
      console.log("[VIDEO] Terminé");
      this.autoNext();
    });

    this.video.addEventListener("error", (e) => {
      console.error("[VIDEO] Erreur:", e);
      this.showError("Erreur de lecture vidéo");
    });

    this.video.addEventListener("waiting", () => {
      this.showLoading();
    });

    this.video.addEventListener("timeupdate", () => this.updateProgress());
    this.video.addEventListener("progress", () => this.updateBuffer());
    this.video.addEventListener("loadedmetadata", () => this.updateDuration());

    // Control events
    this.elements.playPauseBtn?.addEventListener("click", () =>
      this.togglePlayPause()
    );
    this.elements.rewindBtn?.addEventListener("click", () => this.rewind());
    this.elements.forwardBtn?.addEventListener("click", () => this.forward());
    this.elements.muteBtn?.addEventListener("click", () => this.toggleMute());
    this.elements.volumeSlider?.addEventListener("input", (e) =>
      this.setVolume(e.target.value)
    );
    this.elements.fullscreenBtn?.addEventListener("click", () =>
      this.toggleFullscreen()
    );
    this.elements.nextBtn?.addEventListener("click", () => this.autoNext());
    this.elements.closeBtn?.addEventListener("click", () => this.closePlayer());

    // Progress bar
    this.elements.progressContainer?.addEventListener("click", (e) =>
      this.seekToPosition(e)
    );

    // Mouse/touch movement
    this.container?.addEventListener("mousemove", () => this.showControls());
    this.container?.addEventListener("mouseleave", () =>
      this.startInactivityTimer()
    );
    this.container?.addEventListener("touchstart", () => this.showControls());
  }

  setupKeyboardNavigation() {
    document.addEventListener("keydown", (e) => {
      if (overlayEl.hidden) return;

      if (
        [
          "Space",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Enter",
        ].includes(e.code)
      ) {
        e.preventDefault();
      }

      switch (e.code) {
        case "AudioVolumeUp":
  this.adjustVolume(4);
  break;
case "AudioVolumeDown":
  this.adjustVolume(-4);
  break;
case "MediaPlayPause":
  this.togglePlayPause();
  break;

        case "Space":
        case "Enter":
          this.togglePlayPause();
          break;
        case "ArrowLeft":
          this.rewind();
          break;
        case "ArrowRight":
          this.forward();
          break;
        case "ArrowUp":
          this.adjustVolume(10);
          break;
        case "ArrowDown":
          this.adjustVolume(-10);
          break;
        case "KeyF":
          this.toggleFullscreen();
          break;
        case "KeyM":
          this.toggleMute();
          break;
        case "KeyN":
          this.autoNext();
          break;
        case "Escape":
          this.handleEscape();
          break;
      }

      this.showControls();
    });
  }

  async playDirectUrl(url) {
    this.showLoading();
    this.currentSource = url;

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    try {
      console.log("[PLAYER] 🎬 Chargement:", url);

      if (url.endsWith(".m3u8") || url.includes("m3u8")) {
        await this.loadHLS(url);
      } else {
        this.video.src = url;
        this.video.load();
      }
    } catch (error) {
      this.showError(`Erreur lors du chargement: ${error.message}`);
    }
  }

  async loadHLS(source) {
    if (window.Hls && window.Hls.isSupported()) {
      this.hls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        autoStartLoad: true,
        startLevel: -1, // Auto quality
        capLevelToPlayerSize: true,
      });

      this.hls.loadSource(source);
      this.hls.attachMedia(this.video);

      this.hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        console.log("[HLS] Manifest analysé");
        this.hideLoading();
      });

      this.hls.on(window.Hls.Events.ERROR, (event, data) => {
        console.error("[HLS] Erreur:", data);
        if (data.fatal) {
          this.showError("Erreur de streaming HLS");
        }
      });
    } else if (this.video.canPlayType("application/vnd.apple.mpegurl")) {
      this.video.src = source;
      this.video.load();
    } else {
      this.showError("Format HLS non supporté");
    }
  }

  togglePlayPause() {
    if (this.video.paused) {
      this.video.play();
    } else {
      this.video.pause();
    }
    if (this.video.muted && (this.video.paused || this.video.volume === 0)) {
  this.video.muted = false;
  if (this.elements.volumeSlider && this.elements.volumeSlider.value === "0") {
    this.setVolume(50); // remonte à 50% si le slider était à 0
  }
}

  }

  rewind() {
    this.video.currentTime = Math.max(0, this.video.currentTime - 10);
    this.showControls();
  }

  forward() {
    this.video.currentTime = Math.min(
      this.video.duration,
      this.video.currentTime + 10
    );
    this.showControls();
  }

  adjustVolume(change) {
    const currentVol = this.video.muted ? 0 : this.video.volume * 100;
    const newVolume = Math.max(0, Math.min(100, currentVol + change));
    this.setVolume(newVolume);
  }

  setVolume(volume) {
    this.video.volume = volume / 100;
    if (this.elements.volumeSlider) {
      this.elements.volumeSlider.value = volume;
    }

    // Désactiver mute si on augmente le volume
    if (volume > 0 && this.video.muted) {
      this.video.muted = false;
    }

    this.updateMuteButton();
  }

  toggleMute() {
    this.video.muted = !this.video.muted;
    this.updateMuteButton();
  }

  updateMuteButton() {
    if (!this.elements.muteBtn) return;

    if (this.video.muted || this.video.volume === 0) {
      this.elements.muteBtn.innerHTML = "🔇";
    } else if (this.video.volume < 0.5) {
      this.elements.muteBtn.innerHTML = "🔉";
    } else {
      this.elements.muteBtn.innerHTML = "🔊";
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      this.container.requestFullscreen().catch(() => {
        this.showError("Impossible d'activer le plein écran");
      });
    } else {
      document.exitFullscreen();
    }
  }

  handleEscape() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      this.closePlayer();
    }
  }

  closePlayer() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    hidePlayerOverlay();
    if (browserState.slug) showBrowser();
  }

  autoNext() {
    if (
      currentPlayerState.currentEpisodeIndex <
      currentPlayerState.episodes.length - 1
    ) {
      currentPlayerState.currentEpisodeIndex += 1;
      playEpisodeInPlayer(currentPlayerState.currentEpisodeIndex);
      renderPlayerEpisodes();
    }
  }

  seekToPosition(e) {
    const rect = this.elements.progressContainer.getBoundingClientRect();
    const position = (e.clientX - rect.left) / rect.width;
    this.video.currentTime = position * this.video.duration;
  }

  updateProgress() {
    if (this.video.duration) {
      const progress = (this.video.currentTime / this.video.duration) * 100;
      if (this.elements.progressBar) {
        this.elements.progressBar.style.width = `${progress}%`;
      }

      if (this.elements.currentTime) {
        this.elements.currentTime.textContent = formatTime(
          this.video.currentTime
        );
      }
    }
  }

  updateBuffer() {
    if (this.video.buffered.length > 0 && this.elements.progressBuffer) {
      const bufferedEnd = this.video.buffered.end(
        this.video.buffered.length - 1
      );
      const buffer = (bufferedEnd / this.video.duration) * 100;
      this.elements.progressBuffer.style.width = `${buffer}%`;
    }
  }

  updateDuration() {
    if (this.elements.totalTime) {
      this.elements.totalTime.textContent = formatTime(this.video.duration);
    }
  }

  showLoading() {
    if (this.elements.loadingIndicator) {
      this.elements.loadingIndicator.style.display = "flex";
    }
  }

  hideLoading() {
    if (this.elements.loadingIndicator) {
      this.elements.loadingIndicator.style.display = "none";
    }
  }

  showError(message) {
    if (this.elements.errorText) {
      this.elements.errorText.textContent = message;
    }
    if (this.elements.errorMessage) {
      this.elements.errorMessage.style.display = "block";
    }
    this.hideLoading();
  }

  hideError() {
    if (this.elements.errorMessage) {
      this.elements.errorMessage.style.display = "none";
    }
  }

  showControls() {
    this.controlsVisible = true;
    if (this.container) {
      this.container.classList.remove("inactive");
    }
    if (this.elements.controlsOverlay) {
      this.elements.controlsOverlay.classList.add("visible");
    }
    if (this.elements.videoInfo) {
      this.elements.videoInfo.classList.add("visible");
    }
    this.startInactivityTimer();
  }

  hideControls() {
    this.controlsVisible = false;
    if (this.container) {
      this.container.classList.add("inactive");
    }
    if (this.elements.controlsOverlay) {
      this.elements.controlsOverlay.classList.remove("visible");
    }
    if (this.elements.videoInfo) {
      this.elements.videoInfo.classList.remove("visible");
    }
  }

  startInactivityTimer() {
    clearTimeout(this.inactivityTimer);
    this.inactivityTimer = setTimeout(() => {
      if (this.isPlaying) {
        this.hideControls();
      }
    }, 4000);
  }

  retry() {
    if (this.currentSource) {
      this.playDirectUrl(this.currentSource);
    }
  }

  destroy() {
    if (this.hls) {
      this.hls.destroy();
    }
    clearTimeout(this.inactivityTimer);
  }
}

// Initialize player (sans préparation autoplay)
const uzumakiPlayer = new UzumakiSmartPlayer();

function retryCurrentVideo() {
  uzumakiPlayer.retry();
}

/* ---------- Player & Browser Functions ---------- */
function showPlayerOverlay(title = "", subtitle = "") {
  playerTitleEl.textContent = title || "";
  playerSubtitleEl.textContent = subtitle || "";
  overlayEl.hidden = false;
  document.body.style.overflow = "hidden";
  renderPlayerFilters();
  renderPlayerEpisodes();
  const controlsCenter = document.querySelector(".controls-center");
const controlsRight  = document.querySelector(".controls-right");
initRovingGeneric(controlsCenter, ".control-btn", () => uzumakiPlayer.closePlayer());
initRovingGeneric(controlsRight,  ".control-btn", () => uzumakiPlayer.closePlayer());

}

function hidePlayerOverlay() {
  overlayEl.hidden = true;
  try {
    tvVideo.pause();
  } catch {}
  document.body.style.overflow = "";
}

function showBrowser() {
  browserEl.hidden = false;
  browserEl.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  const firstEp = epRow.querySelector(".ep");
  if (firstEp) firstEp.focus();
  else seasonSel.focus();
}

function hideBrowser() {
  // Retirer le focus de tous les éléments dans le navigateur avant de le masquer
  if (document.activeElement && browserEl.contains(document.activeElement)) {
    document.activeElement.blur();
  }

  browserEl.hidden = true;
  browserEl.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  errorContainer.innerHTML = "";
}

function isOverlayOpen() {
  return !!overlayEl && overlayEl.hidden === false;
}

function isBrowserOpen() {
  return !!browserEl && browserEl.hidden === false;
}

function renderPlayerFilters() {
  // seasons
  playerSeasonSel.innerHTML = "";
  
  // Ajouter les attributs ARIA sur le select
  playerSeasonSel.setAttribute("aria-label", "Sélectionner une saison");
  
  const seasons = browserState.availableSeasons?.length
    ? browserState.availableSeasons
    : [currentPlayerState.season];
  
  for (const s of seasons) {
    const opt = document.createElement("option");
    const val = String(s);
    opt.value = val;
    opt.textContent = /^\d+$/.test(val) ? `Saison ${val}` : val;
    if (val === String(currentPlayerState.season)) opt.selected = true;
    playerSeasonSel.appendChild(opt);
  }

  // langs
  playerLangChips.innerHTML = "";
  
  // Ajouter les attributs ARIA sur le conteneur de langues
  playerLangChips.setAttribute("role", "group");
  playerLangChips.setAttribute("aria-label", "Choix de la langue de lecture");
  
  const langs = browserState.availableLanguages?.length
    ? browserState.availableLanguages
    : [currentPlayerState.lang];
  
  for (const L0 of langs) {
    const L = normalizeLang(L0);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lang-chip";
    
    const isSelected = normalizeLang(currentPlayerState.lang) === L;
    
    // AJOUT DES ATTRIBUTS ARIA
    b.setAttribute("role", "button");
    b.setAttribute("aria-pressed", isSelected ? "true" : "false");
    b.setAttribute("aria-label", `Langue ${L.toUpperCase()}${isSelected ? " (active)" : ""}`);
    
    b.textContent = L.toUpperCase();
    
    b.addEventListener("click", async () => {
      if (currentPlayerState.lang === L) return;
      await changeSeasonLangInPlayer(currentPlayerState.season, L);
    });
    
    playerLangChips.appendChild(b);
  }
}

function renderPlayerEpisodes() {
  const container = playerEpisodesScroll;
  if (!container) return;
  container.innerHTML = "";
  
  // Ajouter les attributs ARIA sur le conteneur
  container.setAttribute("role", "list");
  container.setAttribute("aria-label", "Épisodes disponibles");
  
  const episodes = currentPlayerState.episodes || [];
  episodes.forEach((ep, index) => {
    const card = document.createElement("button");
    card.className = "episode-card";
    card.tabIndex = 0;
    
    const isCurrent = index === currentPlayerState.currentEpisodeIndex;
    if (isCurrent) card.classList.add("current");
    
    const number = ep.number ?? index + 1;
    const duration = ep.duration
      ? Math.round((ep.duration || 0) / 60) + "min"
      : "24min";
    const episodeTitle = ep.title || `Épisode ${number}`;
    
    // AJOUT DES ATTRIBUTS ARIA
    card.setAttribute("role", "listitem");
    card.setAttribute("aria-label", `Épisode ${number}: ${episodeTitle}, durée ${duration}`);
    card.setAttribute("aria-current", isCurrent ? "true" : "false");
    card.setAttribute("aria-setsize", String(episodes.length));
    card.setAttribute("aria-posinset", String(index + 1));
    
    card.innerHTML = `
      <img src="${ep.thumbnail || ""}" alt="Aperçu de l'épisode ${number}" class="episode-thumbnail">
      <div class="episode-info">
        <span class="episode-number">E${number}</span>
        <div class="episode-title">${episodeTitle}</div>
        <div class="episode-duration">${duration}</div>
      </div>`;
    
    card.addEventListener("click", () => playEpisodeFromPlayer(index));
    container.appendChild(card);
  });
  
  const currentCard = container.querySelector(".episode-card.current");
  if (currentCard) {
    currentCard.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }
  
  initRovingGeneric(container, ".episode-card", () => uzumakiPlayer.closePlayer());
}

async function playEpisodeFromPlayer(episodeIndex) {
  currentPlayerState.currentEpisodeIndex = episodeIndex;
  await playEpisodeInPlayer(episodeIndex);
  renderPlayerEpisodes();
}

async function fetchDetails(slug, seasonInput = "1", langInput = "vostfr") {
  const season = normalizeSeason(seasonInput);
  const lang = normalizeLang(langInput);
  const key = keyOf(slug, season, lang);
  const hit = getCached(key);
  if (hit) return hit;
  const res = await fetch(`${API_BASE}/api/anime/${slug}/${season}/${lang}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok)
    throw new Error(
      `Erreur API ${
        res.status
      }: Ce contenu n'est pas disponible en ${lang.toUpperCase()}.`
    );
  const json = await res.json();
  const data = Array.isArray(json) ? json[0] : json;
  detailsCache.set(key, { ts: Date.now(), data });
  return data;
}

// =================== NOUVELLE FONCTION playEpisodeInPlayer ===================
async function playEpisodeInPlayer(index) {
  const ep = currentPlayerState.episodes?.[index];
  if (!ep) return;

  const number = ep.number ?? index + 1;
  const sub = ep.title || `Épisode ${number}`;
  playerTitleEl.textContent = ep.showTitle || currentPlayerState.title || "";
  playerSubtitleEl.textContent = `Saison ${currentPlayerState.season} • Épisode ${number} — ${sub}`;

  const hosts = normalizeEmbedUrls(ep.sources || []);
  if (!hosts.length) {
    showError("Aucune source disponible pour cet épisode.");
    return;
  }

  // Nettoyer un éventuel interactor existant
  const oldInteractor = overlayEl.querySelector("#tv-embed-interactor");
  if (oldInteractor) oldInteractor.remove();

  // Trier par préférence
  const { preferred, others } = splitByPreference(hosts);

  // Mode 1: hosts privilégiés → résoudre via serveur puis lecteur
  if (preferred.length) {
    console.log("[PLAYER] Résolution côté serveur pour:", preferred);

    try {
      // Appeler l'endpoint serveur pour résoudre
      const response = await fetch(`${API_BASE}/api/resolver/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: preferred,
          perLinkTimeoutMs: 8000,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erreur serveur: ${response.status}`);
      }

      const data = await response.json();
      console.log("[PLAYER] Réponse serveur:", data);

      let directUrls = [];

      // Gérer différents formats de réponse du serveur
      if (data.results && Array.isArray(data.results)) {
        // Format nouveau : {results: [{success: true, directUrl: "..."}, ...]}
        directUrls = data.results
          .filter((r) => r.success && r.directUrl)
          .map((r) => r.directUrl);
      } else if (data.links && Array.isArray(data.links)) {
        // Format ancien : {links: ["url1", "url2", ...]}
        directUrls = data.links.filter(Boolean);
      } else if (Array.isArray(data)) {
        // Format tableau direct : ["url1", "url2", ...]
        directUrls = data.filter(Boolean);
      } else {
        console.warn("[PLAYER] Format de réponse serveur non reconnu:", data);
      }

      if (directUrls.length > 0) {
        console.log("[PLAYER] URLs directes obtenues:", directUrls);
        // Vérifier l'expiration des tokens Sibnet
        const now = Math.floor(Date.now() / 1000);
        const validUrls = directUrls.filter((url) => {
          const expMatch = url.match(/[?&]e=(\d+)/);
          if (expMatch) {
            const exp = parseInt(expMatch[1]);
            if (exp < now) {
              console.warn("[PLAYER] URL expirée:", url);
              return false;
            }
          }
          return true;
        });
        if (validUrls.length === 0) {
          console.warn("[PLAYER] Toutes les URLs sont expirées, bypass cache");
          // Refaire la requête avec bypassCache=1
          // ... rappel avec ?bypassCache=1
        }
        // Afficher la vidéo
        try {
          tvVideo.style.display = "block";
        } catch {}

        if (typeof window.openPlayer !== "function") {
          console.error(
            "[PLAYER] openPlayer indisponible. Chargez player.js avant."
          );
          showError("Lecteur indisponible (openPlayer non chargé).");
          return;
        }

        // Utiliser les URLs directes dans le lecteur
        await window.openPlayer({
          el: tvVideo,
          embedUrls: directUrls,
          autoplay: true,
          title: `${currentPlayerState.title || ""} — Épisode ${number}`,
        });
        return;
      } else {
        console.warn("[PLAYER] Aucune URL directe obtenue du serveur");
        // Fallback vers l'interacteur pour les URLs non résolues
        console.log("[PLAYER] Fallback vers interacteur pour:", preferred);
        try {
          tvVideo.pause?.();
          tvVideo.style.display = "none";
        } catch {}
        mountEmbedInteractor({
          overlayRoot: overlayEl,
          urls: preferred.concat(others),
        });
        return;
      }
    } catch (error) {
      console.error("[PLAYER] Erreur résolution serveur:", error);
      console.log("[PLAYER] Fallback vers interacteur pour:", preferred);
      // Fallback vers l'interacteur en cas d'erreur serveur
      try {
        tvVideo.pause?.();
        tvVideo.style.display = "none";
      } catch {}
      mountEmbedInteractor({
        overlayRoot: overlayEl,
        urls: preferred.concat(others),
      });
      return;
    }
  }

  // Mode 2: autres embeds → interactor iframe sandboxé (anti popups)
  try {
    tvVideo.pause?.();
    tvVideo.style.display = "none";
  } catch {}
  mountEmbedInteractor({ overlayRoot: overlayEl, urls: others });
}

async function changeSeasonLangInPlayer(season, lang, keepIndex = true) {
  const details = await fetchDetails(
    currentPlayerState.slug || browserState.slug,
    season,
    lang
  );
  const actualData = details.data || details;
  currentPlayerState.season = String(actualData.season || season);
  currentPlayerState.lang = normalizeLang(actualData.lang || lang);
  currentPlayerState.episodes = Array.isArray(actualData.episodes)
    ? actualData.episodes
    : [];
  if (!keepIndex) currentPlayerState.currentEpisodeIndex = 0;
  renderPlayerFilters();
  renderPlayerEpisodes();
  await playEpisodeInPlayer(currentPlayerState.currentEpisodeIndex);
}

/* ---------- Browser & Episode Logic ---------- */
function renderSeasonOptions(current = "1", seasons = []) {
  const cur = String(current || "1");
  seasonSel.innerHTML = "";
  const values = seasons.length ? seasons.map((s) => String(s)) : [cur];
  for (const s of values) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = /^\d+$/.test(s) ? `Saison ${s}` : s;
    if (s === cur) opt.selected = true;
    seasonSel.appendChild(opt);
  }
}

function renderLangChips(current = "vostfr", all = []) {
  langContainer.innerHTML = "";
  
  // Ajouter les attributs ARIA sur le conteneur
  langContainer.setAttribute("role", "group");
  langContainer.setAttribute("aria-label", "Choix de la langue");
  
  const langList = all.length ? all : [current];
  for (const code of langList) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lang-chip";
    
    const normalizedCode = normalizeLang(code);
    const isSelected = normalizeLang(current) === normalizedCode;
    
    // AJOUT DES ATTRIBUTS ARIA
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
    btn.setAttribute("aria-label", `Langue ${normalizedCode.toUpperCase()}${isSelected ? " (sélectionnée)" : ""}`);
    
    btn.textContent = normalizedCode.toUpperCase();
    btn.dataset.lang = normalizedCode;
    
    btn.addEventListener("click", () => {
      const L = normalizeLang(code);
      if (browserState.lang === L) return;
      browserState.lang = L;
      renderLangChips(browserState.lang, browserState.availableLanguages);
      loadSeasonLang(browserState.season, browserState.lang);
    });
    
    langContainer.appendChild(btn);
  }
}

function renderEpisodes(list = []) {
  epRow.innerHTML = "";
  errorContainer.innerHTML = "";
  
  // Ajouter les attributs ARIA sur le conteneur
  epRow.setAttribute("role", "list");
  epRow.setAttribute("aria-label", "Liste des épisodes");
  
  if (list.length === 0) {
    showError(
      "Aucun épisode disponible pour cette saison/langue.",
      errorContainer
    );
    return;
  }
  
  list.forEach((ep, ix) => {
    const btn = document.createElement("button");
    btn.className = "ep";
    btn.tabIndex = ix === 0 ? 0 : -1;
    btn.dataset.index = String(ix);
    
    const number = ep.number ?? ix + 1;
    const episodeTitle = ep.title || `Épisode ${number}`;
    const showTitle = ep.showTitle || browserState.title || "";
    
    // AJOUT DES ATTRIBUTS ARIA
    btn.setAttribute("role", "listitem");
    btn.setAttribute("aria-label", `Épisode ${number}: ${episodeTitle}. ${showTitle}`);
    btn.setAttribute("aria-setsize", String(list.length));
    btn.setAttribute("aria-posinset", String(ix + 1));
    
    btn.innerHTML = `<div class="num">${number}</div><div class="meta"><div class="name">${episodeTitle}</div><div class="sub">${showTitle}</div></div>`;
    
    btn.addEventListener("click", () => playEpisode(ix));
    epRow.appendChild(btn);
  });
  
  if (epRow.firstElementChild) epRow.firstElementChild.focus();
  initRovingGeneric(epRow, ".ep", () => hideBrowser());
}

async function openBrowserFor(slug, title, season = "1", lang = "vostfr") {
  const item = fullCatalogList.find((x) => (x.slug || x.id) === slug) || {};
  const languages = Array.isArray(item.languages)
    ? item.languages
    : Array.isArray(item.lang)
    ? item.lang
    : [];
  const seasons = (() => {
    const raw = Array.isArray(item.season)
      ? item.season
      : Array.isArray(item.seasons)
      ? item.seasons
      : [];
    const mapped = raw
      .map((s) => {
        if (typeof s === "object")
          return String(s.season || s.number || s.name || "1");
        return String(s);
      })
      .filter(Boolean);
    return mapped.length ? mapped : ["1"];
  })();

  browserState.slug = slug;
  browserState.title = title || "";
  browserState.season = normalizeSeason(season);
  browserState.lang = normalizeLang(lang);
  browserState.availableSeasons = seasons;
  browserState.availableLanguages = (
    languages.length ? languages : ["vostfr"]
  ).map(normalizeLang);
  brTitle.textContent = title || slug;
  renderLangChips(browserState.lang, browserState.availableLanguages);
  renderSeasonOptions(browserState.season, browserState.availableSeasons);
  await loadSeasonLang(browserState.season, browserState.lang);
  showBrowser();
}

async function loadSeasonLang(season, lang) {
  try {
    errorContainer.innerHTML = "";
    const details = await fetchDetails(browserState.slug, season, lang);
    const actualData = details.data || details;
    browserState.season = String(actualData.season || season);
    browserState.lang = normalizeLang(actualData.lang || lang);
    browserState.episodes = Array.isArray(actualData.episodes)
      ? actualData.episodes
      : [];
    renderLangChips(browserState.lang, browserState.availableLanguages);
    renderSeasonOptions(browserState.season, browserState.availableSeasons);
    renderEpisodes(browserState.episodes);
    if (!overlayEl.hidden) {
      await changeSeasonLangInPlayer(
        browserState.season,
        browserState.lang,
        false
      );
    }
  } catch (error) {
    console.error("Erreur lors du chargement:", error);
    browserState.episodes = [];
    renderEpisodes([]);
    showError(`Erreur: ${error.message}`, errorContainer);
  }
}

async function playEpisode(index) {
  currentPlayerState = {
    slug: browserState.slug,
    title: browserState.title,
    season: browserState.season,
    lang: browserState.lang,
    episodes: [...browserState.episodes],
    currentEpisodeIndex: index,
  };
  const ep = browserState.episodes?.[index];
  if (!ep) {
    showError("Épisode introuvable.", errorContainer);
    return;
  }
  hideBrowser();
  showPlayerOverlay(playerTitleEl.textContent, playerSubtitleEl.textContent);
  await playEpisodeInPlayer(index);
}

/* ---------- Event Listeners ---------- */
document.addEventListener(
  "keydown",
  async (e) => {
    const isBack =
      e.key === "Escape" ||
      e.key === "Backspace" ||
      e.keyCode === 10009 ||
      e.key === "GoBack" ||
      e.code === "BrowserBack";
    if (!isBack) return;
    if (isOverlayOpen()) {
      e.preventDefault();
      hidePlayerOverlay();
      if (browserState.slug) showBrowser();
      return;
    }
    if (isBrowserOpen()) {
      e.preventDefault();
      hideBrowser();
      const first = document.querySelector("#grid .card");
      if (first) first.focus({ preventScroll: false });
    }
  },
  { capture: true }
);

closeBtn?.addEventListener("click", hideBrowser);
seasonSel.addEventListener("change", (e) => {
  const s = normalizeSeason(e.target.value);
  browserState.season = s;
  loadSeasonLang(s, browserState.lang);
});
playerSeasonSel.addEventListener("change", async (e) => {
  const s = normalizeSeason(e.target.value);
  await changeSeasonLangInPlayer(s, currentPlayerState.lang, false);
});

/* ---------- Resume History ---------- */
function addToResume(item) {
  if (!item?.slug) return;
  const history = JSON.parse(localStorage.getItem("resumeList") || "[]");
  const updated = [item, ...history.filter((x) => x.slug !== item.slug)];
  const trimmed = updated.slice(0, 20);
  localStorage.setItem("resumeList", JSON.stringify(trimmed));
  renderResume();
}

function renderResume() {
  const scroller = document.getElementById("resume-scroller");
  if (!scroller) return;

  // Ajouter les attributs ARIA sur le conteneur
  scroller.setAttribute("role", "list");
  scroller.setAttribute("aria-label", "Historique de lecture");

  const list = JSON.parse(localStorage.getItem("resumeList") || "[]");
  scroller.innerHTML = "";

  for (const item of list) {
    const el = document.createElement("button");
    el.className = "card";
    el.tabIndex = -1;
    el.dataset.slug = item.slug;
    
    // AJOUT DES ATTRIBUTS ARIA
    el.setAttribute("role", "listitem");
    el.setAttribute("aria-label", `Reprendre ${item.title || item.slug}`);

    el.innerHTML = `
      <img class="poster" src="${item.image || ""}" alt="Affiche de ${item.title || item.slug}">
      <div class="title">${item.title || item.slug}</div>
    `;

    el.addEventListener("click", async () => {
      try {
        await openBrowserFor(
          item.slug,
          item.title || item.slug,
          item.season || "1",
          item.lang || "vostfr"
        );
      } catch (error) {
        showError(
          `Erreur lors de l'ouverture depuis Reprendre: ${error.message}`
        );
      }
    });

    scroller.appendChild(el);
  }
}

/* ---------- Catalog & Search ---------- */
let fullCatalogList = [];

function renderCatalog(list, skipFocus = false) {
  const grid = document.getElementById("grid");
  if (!grid) return;
  grid.innerHTML = "";
  
  // Ajouter les attributs ARIA sur le conteneur grid
  grid.setAttribute("role", "list");
  grid.setAttribute("aria-label", "Catalogue des animés");
  
  for (const a of Array.isArray(list) ? list : []) {
    const slug =
      a.slug ||
      a.id ||
      (a.title
        ? String(a.title)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "")
        : "");
    const season =
      a.season ??
      (Array.isArray(a.seasons) && a.seasons.length ? a.seasons[0] : 1);
    const lang =
      (Array.isArray(a.languages) && a.languages[0]) || a.lang || "vostfr";
    
    const el = document.createElement("button");
    el.className = "card";
    el.tabIndex = -1;
    el.dataset.slug = slug;
    el.dataset.season = season;
    el.dataset.lang = lang;
    
    // AJOUT DES ATTRIBUTS ARIA
    el.setAttribute("role", "listitem");
    el.setAttribute("aria-label", `Ouvrir ${a.title || "Sans titre"}${a.year ? `, sorti en ${a.year}` : ""}`);
    
    el.innerHTML = `<img class="poster" alt="Affiche de ${a.title || "Sans titre"}" data-src="${
      a.image || ""
    }" /><div class="title">${a.title || "Sans titre"}</div>${
      a.year ? `<div class="muted">${a.year}</div>` : ""
    }`;
    
    el.addEventListener("click", async () => {
      try {
        addToResume({ slug, title: a.title || slug, image: a.image || "" });
        await openBrowserFor(slug, a.title || slug, season, lang);
      } catch (error) {
        showError(`Erreur lors de l'ouverture: ${error.message}`);
      }
    });
    grid.appendChild(el);
  }
  
  initLazyImages(grid);
  initRoving(grid, () => {});
  const first = grid.querySelector(".card");
  if (first) {
    first.tabIndex = 0;
    if (!skipFocus) first.focus({ preventScroll: false });
  }
}

function initLazyImages(root = document) {
  const imgs = [...root.querySelectorAll("img[data-src]")];
  if (!("IntersectionObserver" in window)) {
    imgs.forEach((i) => {
      i.src = i.dataset.src;
      i.removeAttribute("data-src");
    });
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const img = e.target,
          src = img.dataset.src;
        if (src) {
          img.src = src;
          img.addEventListener("load", () => img.removeAttribute("data-src"), {
            once: true,
          });
        }
        io.unobserve(img);
      });
    },
    { rootMargin: "300px", threshold: 0.01 }
  );
  imgs.forEach((i) => io.observe(i));
}

function initRoving(container, onBack) {
  const items = [...container.querySelectorAll(".card")];
  items.forEach((el, i) => (el.tabIndex = i === 0 ? 0 : -1));
  container.addEventListener("keydown", (e) => {
    const list = [...container.querySelectorAll(".card")];
    if (!list.length) return;

    const currentIndex = list.indexOf(document.activeElement);
    if (currentIndex === -1) return;

    const gridWidth = container.offsetWidth;
    const cardWidth = list[0].offsetWidth;
    const cols = Math.max(1, Math.floor(gridWidth / cardWidth));

    let nextIndex = currentIndex;

    switch (e.key) {
      case "ArrowRight":
        nextIndex = Math.min(currentIndex + 1, list.length - 1);
        break;
      case "ArrowLeft":
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case "ArrowDown":
        nextIndex = Math.min(currentIndex + cols, list.length - 1);
        break;
      case "ArrowUp":
        nextIndex = Math.max(currentIndex - cols, 0);
        break;
      case "Escape":
      case "Backspace":
        e.preventDefault();
        onBack && onBack();
        return;
      default:
        return;
    }

    if (nextIndex !== currentIndex) {
      e.preventDefault();
      list.forEach((el) => (el.tabIndex = -1));
      list[nextIndex].tabIndex = 0;
      list[nextIndex].focus({ preventScroll: false });
    }
  });
}
function initRovingGeneric(container, itemSelector = ".card", onBack) {
  if (!container) return;
  const items = [...container.querySelectorAll(itemSelector)];
  if (!items.length) return;

  // Initial tabindex
  items.forEach((el, i) => (el.tabIndex = i === 0 ? 0 : -1));

  container.addEventListener("keydown", (e) => {
    const list = [...container.querySelectorAll(itemSelector)];
    if (!list.length) return;

    const current = document.activeElement;
    const currentIndex = list.indexOf(current);
    if (currentIndex === -1) return;

    // Estimation colonnes (grilles) sinon navigation linéaire
    const gridWidth = container.offsetWidth || 1;
    const itemWidth = list[0].offsetWidth || gridWidth;
    const cols = Math.max(1, Math.floor(gridWidth / Math.max(1, itemWidth)));

    let nextIndex = currentIndex;

    switch (e.key) {
      case "ArrowRight":
        nextIndex = Math.min(currentIndex + 1, list.length - 1);
        break;
      case "ArrowLeft":
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case "ArrowDown":
        nextIndex = Math.min(currentIndex + cols, list.length - 1);
        break;
      case "ArrowUp":
        nextIndex = Math.max(currentIndex - cols, 0);
        break;
      case "Escape":
      case "Backspace":
      case "GoBack":
        e.preventDefault();
        onBack && onBack();
        return;
      default:
        return; // Laisse passer les autres touches
    }

    if (nextIndex !== currentIndex) {
      e.preventDefault();
      list.forEach((el) => (el.tabIndex = -1));
      list[nextIndex].tabIndex = 0;
      list[nextIndex].focus({ preventScroll: false });
    }
  });
}

function enhancePlayerControls() {
  // Améliorer les boutons de contrôle avec ARIA
  const controls = [
    { id: 'play-pause-btn', label: 'Lecture/Pause' },
    { id: 'rewind-btn', label: 'Reculer de 10 secondes' },
    { id: 'forward-btn', label: 'Avancer de 10 secondes' },
    { id: 'volume-btn', label: 'Couper le son' },
    { id: 'next-btn', label: 'Épisode suivant' },
    { id: 'fullscreen-btn', label: 'Plein écran' },
    { id: 'player-close', label: 'Fermer le lecteur' },
    { id: 'browser-close', label: 'Fermer le navigateur' },
  ];
  
  controls.forEach(({ id, label }) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.setAttribute('role', 'button');
      btn.setAttribute('aria-label', label);
    }
  });
  
  // Améliorer le volume slider
  const volumeSlider = document.getElementById('volumeSlider');
  if (volumeSlider) {
    volumeSlider.setAttribute('role', 'slider');
    volumeSlider.setAttribute('aria-label', 'Volume');
    volumeSlider.setAttribute('aria-valuemin', '0');
    volumeSlider.setAttribute('aria-valuemax', '100');
    volumeSlider.setAttribute('aria-valuenow', volumeSlider.value);
    
    volumeSlider.addEventListener('input', (e) => {
      e.target.setAttribute('aria-valuenow', e.target.value);
    });
  }
  
  // Améliorer la barre de progression
  const progressContainer = document.getElementById('progressContainer');
  if (progressContainer) {
    progressContainer.setAttribute('role', 'progressbar');
    progressContainer.setAttribute('aria-label', 'Progression de la vidéo');
    progressContainer.setAttribute('aria-valuemin', '0');
    progressContainer.setAttribute('aria-valuemax', '100');
  }
}

// Appeler cette fonction après l'initialisation du player
document.addEventListener('DOMContentLoaded', () => {
  enhancePlayerControls();
});

function enhanceFormInputs() {
  // Améliorer la barre de recherche
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.setAttribute('role', 'searchbox');
    searchInput.setAttribute('aria-label', 'Rechercher un animé');
    searchInput.setAttribute('aria-describedby', 'search-hint');
    
    // Ajouter un texte d'aide invisible
    const hint = document.createElement('span');
    hint.id = 'search-hint';
    hint.className = 'tv-sr-only';
    hint.textContent = 'Tapez pour filtrer le catalogue';
    searchInput.parentNode.appendChild(hint);
  }
  
  // Améliorer les selects de saison
  const seasonSelects = ['br-season', 'player-season-select'];
  seasonSelects.forEach(id => {
    const select = document.getElementById(id);
    if (select) {
      select.setAttribute('aria-label', 'Choisir une saison');
    }
  });
}

// Appeler après le DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  enhanceFormInputs();
});


async function loadCatalog() {
  let list = [];
  try {
    let res = await fetch(CATALOG_API, {
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      list = await res.json();
    } else {
      throw new Error(`API non disponible (${res.status})`);
    }
  } catch (e) {
    console.warn("⚠️ API catalogue indisponible, fallback JSON:", e.message);
    try {
      const res = await fetch(CATALOG_FILE, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        list = await res.json();
      } else {
        throw new Error(`Erreur ${res.status}: ${res.statusText}`);
      }
    } catch (e2) {
      console.error("❌ Impossible de charger le catalogue:", e2);
      showError(
        "Impossible de charger le catalogue. Vérifiez votre connexion."
      );
    }
  }

  fullCatalogList = Array.isArray(list) ? list : [];
  renderCatalog(fullCatalogList);
  renderResume();
}

// Setup resume scroller
(function setupResumeScroller() {
  const scroller = document.getElementById("resume-scroller");
  const prevBtn = document.getElementById("resume-prev");
  const nextBtn = document.getElementById("resume-next");
  if (!scroller) return;

  scroller.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        scroller.scrollLeft += e.deltaY;
      }
    },
    { passive: false }
  );

  const by = () => Math.max(240, Math.floor(scroller.clientWidth * 0.9));
  prevBtn?.addEventListener("click", () =>
    scroller.scrollBy({ left: -by(), behavior: "smooth" })
  );
  nextBtn?.addEventListener("click", () =>
    scroller.scrollBy({ left: by(), behavior: "smooth" })
  );
})();

// Search
const searchInputEl = document.getElementById("search-input");
if (searchInputEl) {
  searchInputEl.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = q
      ? fullCatalogList.filter((item) =>
          (item.title || "").toLowerCase().includes(q)
        )
      : fullCatalogList;
    renderCatalog(filtered, true);
  });

  searchInputEl.addEventListener("keydown", (e) => {
    const grid = document.getElementById("grid");
    if (!grid) return;

    if (["Enter", "OK", "ArrowDown", "ArrowRight"].includes(e.key)) {
      const firstCard = grid.querySelector(".card");
      if (firstCard) {
        e.preventDefault();
        firstCard.tabIndex = 0;
        firstCard.focus({ preventScroll: false });
      }
    } else if (["Escape", "Backspace"].includes(e.key) || e.keyCode === 10009) {
      e.preventDefault();
      searchInputEl.value = "";
      renderCatalog(fullCatalogList, true);
      const firstCard = grid.querySelector(".card");
      if (firstCard) {
        firstCard.tabIndex = 0;
        firstCard.focus({ preventScroll: false });
      }
    }
  });
}

// Initialize
loadCatalog().catch(console.error);

// Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    if (location.hostname === "localhost") return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Erreur service worker:", error);
    });
  });
}

/* ===========================
   Player ultra-simplifié - VERSION FINALE
   (reçoit des URLs directes, pas de résolution côté client)
   =========================== */

(function() {
    'use strict';
    
    const LOG_PREFIX = "[PLAYER]";

    function log(...a) { console.log(LOG_PREFIX, ...a); }
    function warn(...a) { console.warn(LOG_PREFIX, ...a); }
    function err(...a) { console.error(LOG_PREFIX, ...a); }

    const VIDEO_EXTS_RE = /\.(mp4|m4v|webm|ogv|mov|m3u8|ts)(\?|#|$)/i;

    function typeFromUrl(url = "") {
        const u = url.toLowerCase();
        if (u.endsWith(".m3u8")) return "hls";
        if (u.endsWith(".mpd")) return "dash";
        if (VIDEO_EXTS_RE.test(u)) return "file";
        return "file";
    }

    function normalizeEmbedUrls(sources = []) {
        const out = [];
        for (const s of sources) {
            if (!s) continue;
            if (typeof s === "string") out.push(s);
            else if (typeof s === "object") {
                const u = s.url || s.src || s.href || "";
                if (u) out.push(u);
            }
        }
        return Array.from(new Set(out));
    }

    // Detect si une URL semble être un lien direct (mp4, m3u8, etc.)
    function seemsDirectUrl(url) {
        try {
            const u = url.toLowerCase();
            return VIDEO_EXTS_RE.test(u) || u.includes('.mp4') || u.includes('.m3u8');
        } catch {
            return false;
        }
    }

    // ========== LECTEUR VIDÉO ==========

    function attachHls(videoEl, url) {
        if (window.Hls && window.Hls.isSupported()) {
            const hls = new window.Hls({ 
                enableWorker: true, 
                startLevel: -1, 
                capLevelToPlayerSize: true 
            });
            hls.loadSource(url);
            hls.attachMedia(videoEl);
            return hls;
        } else {
            videoEl.src = url;
            return null;
        }
    }

    async function tryPlay(videoEl) {
        try {
            videoEl.muted = true;
            videoEl.setAttribute('muted', '');
            videoEl.playsInline = true;
            videoEl.setAttribute('playsinline', '');
            const p = videoEl.play();
            if (p && p.then) await p;
            return true;
        } catch { 
            return false; 
        }
    }

    // ========== FONCTION PRINCIPALE OPENPLAYER ==========

    async function openPlayer({
        el,
        sources = [],
        embedUrls = [],
        autoplay = true,
        title = ""
    } = {}) {
        
        // 1) Validation de l'élément video
        const videoEl = el;
        if (!(videoEl instanceof HTMLVideoElement)) {
            throw new Error("Paramètre 'el' invalide: fournir un HTMLVideoElement");
        }

        // 2) Liste d'URLs en entrée (maintenant toutes directes)
        let urls = Array.isArray(embedUrls) && embedUrls.length ? 
            embedUrls : normalizeEmbedUrls(sources);
        urls = urls.filter(Boolean);

        if (!urls.length) {
            warn("Aucune URL fournie au player");
            return controllerSkeleton(videoEl);
        }

        log("URLs reçues (supposées directes):", urls);

        // 3) Toutes les URLs sont maintenant supposées directes
        const candidates = urls.map(url => ({ url, type: typeFromUrl(url) }));
        log("Candidats directs:", candidates);

        // 4) Lecture: on tente dans l'ordre
        let currentIdx = -1;
        let currentHls = null;

        function cleanup() {
            if (currentHls) { 
                try { currentHls.destroy(); } catch {} 
                currentHls = null; 
            }
            try { 
                videoEl.removeAttribute("src"); 
                videoEl.load(); 
            } catch {}
        }

        async function startWithCandidate(i) {
            if (i < 0 || i >= candidates.length) return false;
            
            currentIdx = i;
            const c = candidates[i];
            cleanup();
            
            log(`Test source [${i+1}/${candidates.length}]`, c.type, c.url);

            switch (c.type) {
                case "hls":
                    currentHls = attachHls(videoEl, c.url);
                    break;
                default:
                    videoEl.src = c.url;
                    break;
            }

            videoEl.load();
            const played = await tryPlay(videoEl);
            
            if (!played) { 
                warn("Lecture KO → suivant"); 
                return false; 
            }
            
            log("Lecture OK ✅", c.url);
            return true;
        }

        async function tryNext(reason = "") {
            const next = currentIdx + 1;
            if (next >= candidates.length) {
                err("Aucune source directe lisible", { reason, tried: candidates.length });
                return false;
            }
            const ok = await startWithCandidate(next);
            if (!ok) return tryNext("candidate_failed");
            return true;
        }

        if (autoplay) {
            const ok = await startWithCandidate(0);
            if (!ok) await tryNext("autoplay_first_failed");
        }

        // Gestion d'erreurs basiques → on passe à la suivante
        videoEl.addEventListener("error", () => { tryNext("video_error"); });
        videoEl.addEventListener("stalled", () => { tryNext("stalled"); });
        videoEl.addEventListener("emptied", () => { tryNext("emptied"); });
        videoEl.addEventListener("abort", () => { tryNext("abort"); });

        return {
            getAllSources: () => candidates.slice(),
            forceNext: () => tryNext("manual_force_next"),
            getStats: () => ({ 
                currentIdx, 
                totalSources: candidates.length, 
                isPlaying: !videoEl.paused, 
                currentTime: videoEl.currentTime, 
                duration: videoEl.duration 
            }),
            cleanup
        };
    }

    function controllerSkeleton(videoEl) {
        return {
            getAllSources: () => [],
            forceNext: () => false,
            getStats: () => ({ 
                currentIdx: -1, 
                totalSources: 0, 
                isPlaying: !videoEl?.paused 
            }),
            cleanup: () => { 
                try { 
                    videoEl?.removeAttribute("src"); 
                    videoEl?.load(); 
                } catch {} 
            }
        };
    }

    // ========== EXPOSITION GLOBALE ==========
    
    // Exposer la fonction principale dans le scope global
    window.openPlayer = openPlayer;
    
    console.log("[PLAYER] Player final chargé (reçoit URLs directes seulement)");

})();
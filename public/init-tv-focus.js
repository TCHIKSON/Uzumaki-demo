/**
 * init-tv-focus.js
 * Intégration du FocusManager avec l'application existante
 */

import focusManager from './focus-manager.js';

// ===== CONFIGURATION INITIALE =====
const TV_CONFIG = {
  debug: false, // Mettre à true pour debug
  throttleDelay: 100, // Délai anti-spam touches
  scrollPadding: 100, // Padding pour le scroll automatique
};

// ===== INITIALISATION AU CHARGEMENT =====
document.addEventListener('DOMContentLoaded', () => {
  console.log('[TV] Initialisation navigation Android TV...');
  
  // 1. Ajouter les classes TV safe area au body
  document.body.classList.add('tv-safe');
  
  // 2. Initialiser le FocusManager global
  focusManager.initFocus(document, {
    debug: TV_CONFIG.debug,
    initialFocus: '#search-input' // Focus initial sur la recherche
  });
  
  // 3. Configurer les conteneurs principaux
  setupMainContainers();
  
  // 4. Patcher les fonctions existantes pour intégrer le focus
  patchExistingFunctions();
  
  // 5. Ajouter les event listeners TV spécifiques
  setupTVEventListeners();
  
  console.log('[TV] Navigation Android TV initialisée ✓');
});

// ===== CONFIGURATION DES CONTENEURS =====
function setupMainContainers() {
  // Grille principale
  const grid = document.getElementById('grid');
  if (grid) {
    focusManager.configureContainer(grid, {
      nav: 'grid',
      wrap: 'x',
      memory: true
    });
  }
  
  // Scroller de reprise
  const resumeScroller = document.getElementById('resume-scroller');
  if (resumeScroller) {
    focusManager.configureContainer(resumeScroller, {
      nav: 'row',
      wrap: 'x',
      memory: true
    });
  }
  
  // Liste des épisodes dans le browser
  const epRow = document.getElementById('ep-row');
  if (epRow) {
    focusManager.configureContainer(epRow, {
      nav: 'grid',
      wrap: 'none',
      memory: true
    });
  }
  
  // Contrôles du player
  const controlsCenter = document.querySelector('.controls-center');
  if (controlsCenter) {
    focusManager.configureContainer(controlsCenter, {
      nav: 'row',
      wrap: 'x',
      memory: false
    });
  }
  
  const controlsRight = document.querySelector('.controls-right');
  if (controlsRight) {
    focusManager.configureContainer(controlsRight, {
      nav: 'row',
      wrap: 'x',
      memory: false
    });
  }
  
  // Episodes du player
  const playerEpisodes = document.getElementById('player-episodes-scroll');
  if (playerEpisodes) {
    focusManager.configureContainer(playerEpisodes, {
      nav: 'row',
      wrap: 'x',
      memory: true
    });
  }
}

// ===== PATCH DES FONCTIONS EXISTANTES =====
function patchExistingFunctions() {
  // Patch renderCatalog pour réinitialiser le focus
  const originalRenderCatalog = window.renderCatalog;
  if (originalRenderCatalog) {
    window.renderCatalog = function(list, skipFocus = false) {
      originalRenderCatalog(list, skipFocus);
      
      // Réinitialiser le FocusManager pour la nouvelle grille
      setTimeout(() => {
        const grid = document.getElementById('grid');
        if (grid) {
          focusManager.setupContainer(grid);
          if (!skipFocus) {
            const firstCard = grid.querySelector('.card');
            if (firstCard) {
              focusManager.setInitialFocus(firstCard);
            }
          }
        }
      }, 100);
    };
  }
  
  // Patch renderPlayerEpisodes pour le focus memory
  const originalRenderPlayerEpisodes = window.renderPlayerEpisodes;
  if (originalRenderPlayerEpisodes) {
    window.renderPlayerEpisodes = function() {
      originalRenderPlayerEpisodes();
      
      setTimeout(() => {
        const container = document.getElementById('player-episodes-scroll');
        if (container) {
          focusManager.setupContainer(container);
          
          // Restaurer le focus mémorisé ou focus sur l'épisode actuel
          if (!focusManager.restoreFocus(container)) {
            const currentCard = container.querySelector('.episode-card.current');
            if (currentCard) {
              focusManager.setInitialFocus(currentCard);
            }
          }
        }
      }, 100);
    };
  }
  
  // Patch renderEpisodes pour le browser
  const originalRenderEpisodes = window.renderEpisodes;
  if (originalRenderEpisodes) {
    window.renderEpisodes = function(list = []) {
      originalRenderEpisodes(list);
      
      setTimeout(() => {
        const epRow = document.getElementById('ep-row');
        if (epRow && list.length > 0) {
          focusManager.setupContainer(epRow);
          
          // Restaurer ou initialiser le focus
          if (!focusManager.restoreFocus(epRow)) {
            const firstEp = epRow.querySelector('.ep');
            if (firstEp) {
              focusManager.setInitialFocus(firstEp);
            }
          }
        }
      }, 100);
    };
  }
  
  // Patch showBrowser pour gérer le focus trap
  const originalShowBrowser = window.showBrowser;
  if (originalShowBrowser) {
    window.showBrowser = function() {
      originalShowBrowser();
      
      // Focus trap dans le browser
      setTimeout(() => {
        const browser = document.getElementById('browser');
        if (browser) {
          // Sauvegarder le focus actuel
          focusManager.rememberFocus(document.body);
          
          // Focus sur le premier élément du browser
          const firstFocusable = browser.querySelector('[tabindex="0"], button:not([disabled]), .ep');
          if (firstFocusable) {
            focusManager.setInitialFocus(firstFocusable);
          }
        }
      }, 100);
    };
  }
  
  // Patch hideBrowser pour restaurer le focus
  const originalHideBrowser = window.hideBrowser;
  if (originalHideBrowser) {
    window.hideBrowser = function() {
      originalHideBrowser();
      
      // Restaurer le focus précédent
      setTimeout(() => {
        focusManager.restoreFocus(document.body);
      }, 100);
    };
  }
  
  // Patch showPlayerOverlay
  const originalShowPlayerOverlay = window.showPlayerOverlay;
  if (originalShowPlayerOverlay) {
    window.showPlayerOverlay = function(title = "", subtitle = "") {
      originalShowPlayerOverlay(title, subtitle);
      
      setTimeout(() => {
        const playBtn = document.getElementById('play-pause-btn');
        if (playBtn) {
          focusManager.setInitialFocus(playBtn);
        }
        
        // Réinitialiser les conteneurs du player
        setupPlayerContainers();
      }, 100);
    };
  }
}

// ===== CONFIGURATION SPÉCIFIQUE DU PLAYER =====
function setupPlayerContainers() {
  const containers = [
    { selector: '.controls-center', config: { nav: 'row', wrap: 'x' }},
    { selector: '.controls-right', config: { nav: 'row', wrap: 'none' }},
    { selector: '#player-episodes-scroll', config: { nav: 'row', wrap: 'x', memory: true }},
    { selector: '#player-lang-chips', config: { nav: 'row', wrap: 'x' }},
  ];
  
  containers.forEach(({ selector, config }) => {
    const el = document.querySelector(selector);
    if (el) {
      focusManager.configureContainer(el, config);
      focusManager.setupContainer(el);
    }
  });
}

// ===== EVENT LISTENERS TV SPÉCIFIQUES =====
function setupTVEventListeners() {
  // Gestion de la touche Back/Escape améliorée
  document.addEventListener('keydown', (e) => {
    const isBack = e.key === 'Escape' || 
                   e.key === 'Backspace' || 
                   e.key === 'GoBack' ||
                   e.keyCode === 10009 || // Android TV Back
                   e.code === 'BrowserBack';
    
    if (!isBack) return;
    
    // Gérer la navigation back selon le contexte
    const playerOverlay = document.getElementById('player-overlay');
    const browser = document.getElementById('browser');
    const activeElement = document.activeElement;
    
    // Si dans un input, vider et sortir
    if (activeElement && activeElement.matches('input[type="search"]')) {
      if (activeElement.value) {
        e.preventDefault();
        activeElement.value = '';
        activeElement.dispatchEvent(new Event('input'));
      } else {
        e.preventDefault();
        const grid = document.getElementById('grid');
        const firstCard = grid?.querySelector('.card');
        if (firstCard) {
          focusManager.setInitialFocus(firstCard);
        }
      }
      return;
    }
    
    // Si player ouvert
    if (playerOverlay && !playerOverlay.hidden) {
      e.preventDefault();
      window.hidePlayerOverlay?.();
      
      // Restaurer le focus sur le browser ou la grille
      if (browser && !browser.hidden) {
        const epRow = document.getElementById('ep-row');
        focusManager.restoreFocus(epRow);
      } else {
        focusManager.restoreFocus(document.body);
      }
      return;
    }
    
    // Si browser ouvert
    if (browser && !browser.hidden) {
      e.preventDefault();
      window.hideBrowser?.();
      focusManager.restoreFocus(document.body);
      return;
    }
  }, true);
  
  // Gestion des touches média Android TV
  document.addEventListener('keydown', (e) => {
    switch(e.key) {
      case 'MediaPlayPause':
        e.preventDefault();
        const playBtn = document.getElementById('play-pause-btn');
        if (playBtn) playBtn.click();
        break;
        
      case 'MediaPlay':
        e.preventDefault();
        const video = document.getElementById('tv-video');
        if (video && video.paused) {
          video.play();
        }
        break;
        
      case 'MediaPause':
        e.preventDefault();
        const video2 = document.getElementById('tv-video');
        if (video2 && !video2.paused) {
          video2.pause();
        }
        break;
        
      case 'MediaTrackNext':
        e.preventDefault();
        const nextBtn = document.getElementById('next-btn');
        if (nextBtn) nextBtn.click();
        break;
        
      case 'MediaTrackPrevious':
        e.preventDefault();
        // Implémenter previous episode si nécessaire
        break;
        
      case 'AudioVolumeUp':
        e.preventDefault();
        window.uzumakiPlayer?.adjustVolume(10);
        break;
        
      case 'AudioVolumeDown':
        e.preventDefault();
        window.uzumakiPlayer?.adjustVolume(-10);
        break;
        
      case 'AudioVolumeMute':
        e.preventDefault();
        window.uzumakiPlayer?.toggleMute();
        break;
    }
  });
  
  // Observer les changements DOM pour réinitialiser le focus
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.dataset?.nav) {
            // Un nouveau conteneur de navigation a été ajouté
            setTimeout(() => {
              focusManager.setupContainer(node);
            }, 50);
          }
        });
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Gestion du focus pour les éléments dynamiques
  document.addEventListener('focusin', (e) => {
    // Ajouter une classe au body pour indiquer qu'on navigue
    document.body.classList.add('is-navigating');
    
    // Retirer après inactivité
    clearTimeout(window.navigationTimeout);
    window.navigationTimeout = setTimeout(() => {
      document.body.classList.remove('is-navigating');
    }, 5000);
  });
}

// ===== HELPERS =====

// Fonction pour forcer la mise à jour du focus sur un conteneur
window.updateTVFocus = function(containerSelector) {
  const container = document.querySelector(containerSelector);
  if (container) {
    focusManager.setupContainer(container);
    console.log(`[TV] Focus mis à jour pour ${containerSelector}`);
  }
};

// Fonction pour activer/désactiver le mode debug
window.toggleTVDebug = function() {
  TV_CONFIG.debug = !TV_CONFIG.debug;
  focusManager.debug = TV_CONFIG.debug;
  document.body.classList.toggle('tv-debug', TV_CONFIG.debug);
  console.log(`[TV] Mode debug: ${TV_CONFIG.debug ? 'ON' : 'OFF'}`);
};

// Export pour usage externe si nécessaire
window.tvFocusManager = focusManager;
window.tvConfig = TV_CONFIG;
#!/usr/bin/env python3
import sys
import json
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

def autoplay_embed(url, timeout=10):
    """
    Charge une page embed, déclenche l'autoplay, et retourne le HTML modifié
    """
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--autoplay-policy=no-user-gesture-required")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option('useAutomationExtension', False)
    
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)
    
    try:
        driver.get(url)
        time.sleep(3)  # Attendre le chargement
        
        # Déclencher l'autoplay
        driver.execute_script("""
            const videos = document.querySelectorAll('video');
            videos.forEach(v => {
                v.muted = true;
                v.setAttribute('autoplay', '');
                v.setAttribute('playsinline', '');
                try { v.play(); } catch(e) {}
            });
            
            // Cliquer sur le player si nécessaire
            const playBtns = document.querySelectorAll('.jw-display-icon-container, .vjs-big-play-button, [aria-label*="Play"]');
            playBtns.forEach(btn => {
                try { btn.click(); } catch(e) {}
            });
        """)
        
        time.sleep(2)  # Laisser le temps à la vidéo de démarrer
        
        # Injecter du CSS pour masquer les éléments indésirables
        driver.execute_script("""
            const style = document.createElement('style');
            style.textContent = `
                .ad-overlay, .advertisement, [class*="popup"], [class*="ad-container"] {
                    display: none !important;
                }
            `;
            document.head.appendChild(style);
        """)
        
        # Retourner le HTML modifié
        html = driver.page_source
        
        return {
            "success": True,
            "html": html,
            "url": url
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "url": url
        }
    finally:
        driver.quit()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "URL manquante"}))
        sys.exit(1)
    
    url = sys.argv[1]
    result = autoplay_embed(url)
    print(json.dumps(result))
import axios from 'axios';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

class SibnetExtractor {
    constructor() {
        this.baseUrl = 'https://video.sibnet.ru';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://video.sibnet.ru/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        };
    }

    /**
     * Extrait le lien direct d'une vidéo Sibnet
     * @param {string} videoId - ID de la vidéo (ex: "4935158")
     * @returns {Promise<string>} URL directe de la vidéo
     */
    async getDirectLink(videoId) {
        try {
            console.log(`🔍 Extraction du lien pour la vidéo ID: ${videoId}`);
            
            // Étape 1: Récupérer la page embed
            const embedUrl = `${this.baseUrl}/shell.php?videoid=${videoId}`;
            console.log(`📥 Récupération de: ${embedUrl}`);
            
            const response = await axios.get(embedUrl, {
                headers: this.headers,
                timeout: 10000
            });

            console.log(`✅ Page récupérée (${response.status})`);

            // Étape 2: Extraire l'URL MP4 du code JavaScript
            const videoUrl = this.extractVideoUrl(response.data, videoId);
            
            if (!videoUrl) {
                throw new Error('URL de la vidéo non trouvée dans le code source');
            }

            console.log(`🎯 URL trouvée: ${videoUrl}`);

            // Étape 3: Suivre les redirections pour obtenir l'URL finale
            const finalUrl = await this.getFinalUrl(videoUrl);
            
            console.log(`🚀 URL finale: ${finalUrl}`);
            return finalUrl;

        } catch (error) {
            console.error(`❌ Erreur: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extrait l'URL de la vidéo depuis le HTML de la page
     */
    extractVideoUrl(html, videoId) {
        console.log(`🔍 Analyse du code source...`);
        
        // Méthode 1: Chercher dans player.src()
        let match = html.match(/player\.src\(\s?\[\s?\{\s?src\s?\:\s?[\"\'](\/v\/.*?\.mp4)[\"\']/);
        
        if (match && match[1]) {
            console.log(`✅ URL trouvée via player.src()`);
            return `${this.baseUrl}${match[1]}`;
        }

        // Méthode 2: Chercher dans jwplayer setup
        match = html.match(/[\"\']\s?file\s?[\"\']\s?:\s?[\"\'](\/v\/.*?\.mp4)[\"\']/);
        
        if (match && match[1]) {
            console.log(`✅ URL trouvée via jwplayer setup`);
            return `${this.baseUrl}${match[1]}`;
        }

        // Méthode 3: Chercher toute URL MP4 avec pattern /v/
        match = html.match(/(\/v\/[a-f0-9]+\/\d+\.mp4)/);
        
        if (match && match[1]) {
            console.log(`✅ URL trouvée via pattern /v/`);
            return `${this.baseUrl}${match[1]}`;
        }

        // Méthode 4: Chercher dans le setup du player (plus large)
        match = html.match(/(?:src|file|url)['"]?\s*[:=]\s*['"]([^'"]*\/v\/[^'"]*\.mp4[^'"]*)['"]/);
        
        if (match && match[1]) {
            console.log(`✅ URL trouvée via setup player général`);
            const url = match[1].startsWith('/') ? `${this.baseUrl}${match[1]}` : match[1];
            return url;
        }

        // Méthode 5: Chercher toute URL MP4 contenant sibnet
        match = html.match(/(['"])(https?:\/\/[^'"]*sibnet[^'"]*\.mp4[^'"]*)\1/);
        
        if (match && match[2]) {
            console.log(`✅ URL trouvée via pattern sibnet MP4`);
            return match[2];
        }

        console.log(`⚠️ Aucune URL trouvée avec les patterns habituels`);
        
        // Debug: afficher des extraits du HTML pour analyse
        console.log(`📝 Recherche de traces dans le HTML...`);
        
        // Chercher toute mention de "mp4"
        const mp4Mentions = html.match(/[^'">\s]*\.mp4[^'"<\s]*/g);
        if (mp4Mentions) {
            console.log(`🔍 URLs MP4 trouvées:`, mp4Mentions.slice(0, 5)); // Limiter à 5 résultats
        }

        // Chercher les scripts contenant "player" ou "video"
        const playerScripts = html.match(/<script[^>]*>[\s\S]*?player[\s\S]*?<\/script>/gi);
        if (playerScripts) {
            console.log(`📹 Scripts player trouvés: ${playerScripts.length}`);
        }

        return null;
    }

    /**
     * Suit les redirections pour obtenir l'URL finale avec tokens
     */
    async getFinalUrl(videoUrl) {
        console.log(`🔄 Suivi des redirections...`);
        
        // Méthode 1: Essayer avec GET et intercepter la redirection
        try {
            const response = await axios.get(videoUrl, {
                headers: {
                    ...this.headers,
                    'Range': 'bytes=0-1023'
                },
                maxRedirects: 0,
                validateStatus: (status) => status < 400 || status === 302 || status === 301
            });

            if (response.headers.location) {
                let finalUrl = response.headers.location;
                if (finalUrl.startsWith('//')) {
                    finalUrl = 'https:' + finalUrl;
                }
                console.log(`✅ Redirection détectée vers: ${finalUrl}`);
                return finalUrl;
            }

        } catch (error) {
            if (error.response && error.response.headers.location) {
                let finalUrl = error.response.headers.location;
                if (finalUrl.startsWith('//')) {
                    finalUrl = 'https:' + finalUrl;
                }
                console.log(`✅ Redirection interceptée: ${finalUrl}`);
                return finalUrl;
            }
        }

        // Méthode 2: Essayer avec HEAD sans Range
        try {
            const response = await axios.head(videoUrl, {
                headers: this.headers,
                maxRedirects: 5,
                timeout: 10000
            });

            const finalUrl = response.request.res.responseUrl || videoUrl;
            
            const contentLength = response.headers['content-length'];
            if (contentLength) {
                const sizeMB = (parseInt(contentLength) / (1024 * 1024)).toFixed(2);
                console.log(`📁 Taille du fichier: ${sizeMB} MB`);
            }

            return finalUrl;

        } catch (error) {
            console.warn(`⚠️  Méthode HEAD échouée: ${error.message}`);
        }

        // Méthode 3: Essayer de faire une vraie requête GET mais limitée
        try {
            console.log(`🔄 Tentative de requête GET limitée...`);
            
            const response = await axios.get(videoUrl, {
                headers: this.headers,
                maxRedirects: 5,
                timeout: 15000,
                responseType: 'stream'
            });

            response.data.destroy();
            
            const finalUrl = response.request.res.responseUrl || videoUrl;
            console.log(`✅ URL finale obtenue via GET: ${finalUrl}`);
            
            return finalUrl;

        } catch (error) {
            console.warn(`⚠️  Toutes les méthodes ont échoué: ${error.message}`);
            return videoUrl;
        }
    }

    /**
     * Vérifie si l'URL est fonctionnelle et retourne des infos
     */
    async validateUrl(url) {
        try {
            console.log(`🧪 Test de l'URL...`);
            
            // Utiliser GET avec Range au lieu de HEAD (Sibnet refuse HEAD)
            const response = await axios.get(url, {
                headers: {
                    ...this.headers,
                    'Range': 'bytes=0-1023' // Télécharger seulement les premiers 1024 bytes
                },
                timeout: 10000,
                responseType: 'stream'
            });

            // Arrêter immédiatement le stream pour éviter de télécharger tout
            response.data.destroy();

            const isValid = response.status === 200 || response.status === 206;
            const contentLength = response.headers['content-length'] || response.headers['content-range'];
            const contentType = response.headers['content-type'];
            
            console.log(`${isValid ? '✅' : '❌'} URL ${isValid ? 'fonctionnelle' : 'non fonctionnelle'}`);
            
            // Extraire la taille depuis content-range si disponible
            if (contentLength) {
                let size = 0;
                if (response.headers['content-range']) {
                    // Format: "bytes 0-1023/123456789"
                    const match = response.headers['content-range'].match(/\/(\d+)$/);
                    if (match) {
                        size = parseInt(match[1]);
                    }
                } else {
                    size = parseInt(contentLength);
                }
                
                if (size > 0) {
                    const sizeMB = (size / (1024 * 1024)).toFixed(2);
                    console.log(`📁 Taille: ${sizeMB} MB`);
                }
            }
            
            if (contentType) {
                console.log(`📄 Type: ${contentType}`);
            }

            return {
                isValid,
                size: contentLength ? parseInt(contentLength) : null,
                contentType
            };

        } catch (error) {
            console.log(`❌ URL non accessible: ${error.message}`);
            return { isValid: false, error: error.message };
        }
    }

    /**
     * Télécharge la vidéo
     */
    async downloadVideo(videoId, outputPath = null) {
        try {
            const directUrl = await this.getDirectLink(videoId);
            const fileName = outputPath || `sibnet_video_${videoId}.mp4`;
            
            console.log(`💾 Téléchargement vers: ${fileName}`);
            
            const response = await axios({
                method: 'GET',
                url: directUrl,
                headers: this.headers,
                responseType: 'stream'
            });

            const fs = require('fs');
            const writer = fs.createWriteStream(fileName);
            
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log(`✅ Téléchargement terminé: ${fileName}`);
                    resolve(fileName);
                });
                writer.on('error', reject);
            });

        } catch (error) {
            console.error(`❌ Erreur de téléchargement: ${error.message}`);
            throw error;
        }
    }

    /**
     * Méthode alternative via page video principale
     */
    async getVideoPageLink(videoId) {
        try {
            console.log(`🔄 Tentative via page video principale...`);
            
            const videoPageUrl = `${this.baseUrl}/video${videoId}.html`;
            const response = await axios.get(videoPageUrl, {
                headers: this.headers,
                timeout: 10000
            });

            console.log(`✅ Page video récupérée (${response.status})`);
            return this.extractVideoUrl(response.data, videoId);

        } catch (error) {
            console.warn(`⚠️ Méthode page video échouée: ${error.message}`);
            return null;
        }
    }

    /**
     * Extrait l'ID de la vidéo depuis une URL Sibnet complète
     */
    static extractVideoId(url) {
        // Gérer les URLs video : https://video.sibnet.ru/video4935158.html
        let match = url.match(/video\.sibnet\.ru\/video(\d+)\.html/);
        if (match && match[1]) {
            return match[1];
        }
        
        // Gérer les URLs shell : https://video.sibnet.ru/shell.php?videoid=4935158
        match = url.match(/shell\.php\?videoid=(\d+)/);
        if (match && match[1]) {
            return match[1];
        }
        
        // Gérer les URLs directes : https://video.sibnet.ru/4935158
        match = url.match(/video\.sibnet\.ru\/(\d+)$/);
        if (match && match[1]) {
            return match[1];
        }
        
        // Dernier recours : extraire tout nombre de 6+ chiffres
        match = url.match(/(\d{6,})/);
        return match ? match[1] : null;
    }
}

// Utilisation
async function main() {
    const extractor = new SibnetExtractor();
    
    try {
        // OPTION 1: Remplacez par votre ID de vidéo Sibnet
        // const videoId = "4935158"; // Changez ici votre ID
        
        // OPTION 2: Utilisez directement une URL complète (ACTIVÉE)
        const fullUrl = "https://video.sibnet.ru/shell.php?videoid=4740096";
        const videoId = SibnetExtractor.extractVideoId(fullUrl);
        
        console.log(`📝 URL source: ${fullUrl}`);
        console.log(`📝 ID extrait: ${videoId}`);
        
        if (!videoId) {
            throw new Error('Impossible d\'extraire l\'ID de la vidéo depuis cette URL');
        }
        
        console.log(`🚀 Démarrage de l'extraction pour Sibnet...`);
        
        let directLink;
        
        try {
            directLink = await extractor.getDirectLink(videoId);
        } catch (error) {
            console.log(`🔄 Tentative via page video principale...`);
            directLink = await extractor.getVideoPageLink(videoId);
            
            if (!directLink) {
                throw new Error('Impossible d\'extraire l\'URL par les deux méthodes');
            }
        }
        
        console.log(`\n🎉 RÉSULTAT:`);
        console.log(`URL directe: ${directLink}`);
        
        console.log(`\n🔍 VÉRIFICATION:`);
        const validation = await extractor.validateUrl(directLink);
        
        if (validation.isValid) {
            console.log(`\n✅ L'URL est prête pour le téléchargement !`);
            console.log(`💡 Vous pouvez maintenant utiliser cette URL dans votre lecteur vidéo`);
            // Décommentez pour télécharger:
            // await extractor.downloadVideo(videoId);
        } else {
            console.log(`\n❌ L'URL nécessite des tokens supplémentaires`);
            console.log(`💡 Essayez de relancer le script ou vérifiez la validité du videoId`);
        }
        
    } catch (error) {
        console.error('Échec de l\'extraction:', error.message);
        console.log(`\n💡 CONSEILS DE DÉPANNAGE:`);
        console.log(`- Vérifiez que l'ID de la vidéo est correct`);
        console.log(`- La vidéo peut être privée ou supprimée`);
        console.log(`- Sibnet peut avoir changé sa structure`);
    }
}

// Fonction utilitaire pour extraire depuis une URL complète
async function extractFromUrl(fullUrl) {
    const videoId = SibnetExtractor.extractVideoId(fullUrl);
    
    if (!videoId) {
        throw new Error('Impossible d\'extraire l\'ID de la vidéo depuis cette URL');
    }
    
    console.log(`📝 ID extrait: ${videoId}`);
    
    const extractor = new SibnetExtractor();
    return await extractor.getDirectLink(videoId);
}

// EXEMPLE PRATIQUE avec une URL Sibnet
/*async function mainWithYourUrl() {
    try {
        // Votre URL Sibnet
        const yourUrl = "https://video.sibnet.ru/video4935158.html";
        
        console.log(`🚀 Extraction depuis: ${yourUrl}`);
        const directLink = await extractFromUrl(yourUrl);
        
        console.log(`\n🎉 RÉSULTAT:`);
        console.log(`URL directe: ${directLink}`);
        
    } catch (error) {
        console.error('Erreur:', error.message);
    }
}*/

// Exporter pour utilisation comme module
export default SibnetExtractor;
export { extractFromUrl };

// Exécuter si lancé directement
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main();                    // OPTION 2 activée dans main()
}
import axios from 'axios';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

class SendVidExtractor {
    constructor() {
        this.baseUrl = 'https://sendvid.com';
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://sendvid.com/',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br'
        };
    }

    /**
     * Extrait le lien direct d'une vidéo SendVid
     * @param {string} videoId - ID de la vidéo (ex: "spd4k5mz") 
     * @returns {Promise<string>} URL directe de la vidéo
     */
    async getDirectLink(videoId) {
        try {
            console.log(`🔍 Extraction du lien pour la vidéo ID: ${videoId}`);
            
            // Étape 1: Récupérer la page de la vidéo
            const videoUrl = `${this.baseUrl}/${videoId}`;
            console.log(`📥 Récupération de: ${videoUrl}`);
            
            const response = await axios.get(videoUrl, {
                headers: this.headers,
                timeout: 10000
            });

            console.log(`✅ Page récupérée (${response.status})`);

            // Étape 2: Extraire l'URL MP4 du code JavaScript/HTML
            const directUrl = this.extractVideoUrl(response.data, videoId);
            
            if (!directUrl) {
                throw new Error('URL de la vidéo non trouvée dans le code source');
            }

            console.log(`🎯 URL trouvée: ${directUrl}`);

            // Étape 3: Valider que l'URL fonctionne
            const validation = await this.validateUrl(directUrl);
            
            if (!validation.isValid) {
                console.warn(`⚠️ URL peut nécessiter des ajustements`);
            }

            return directUrl;

        } catch (error) {
            console.error(`❌ Erreur: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extrait l'URL de la vidéo depuis le HTML de la page SendVid
     */
    extractVideoUrl(html, videoId) {
        console.log(`🔍 Analyse du code source...`);
        
        // Méthode 1: Chercher dans les balises video/source
        let match = html.match(/<video[^>]*>.*?<source[^>]*src=['"]([^'"]*\.mp4[^'"]*)['"]/s);
        if (match && match[1]) {
            console.log(`✅ URL trouvée via balise source`);
            return this.cleanUrl(match[1]);
        }

        // Méthode 2: Chercher dans le JavaScript (player setup)
        match = html.match(/(?:src|file|url)['"]?\s*[:=]\s*['"]([^'"]*videos[^'"]*\.mp4[^'"]*)['"]/);
        if (match && match[1]) {
            console.log(`✅ URL trouvée via JavaScript player`);
            return this.cleanUrl(match[1]);
        }

        // Méthode 3: Chercher directement les URLs videos.sendvid.com ou videos2.sendvid.com
        match = html.match(/(https?:\/\/videos[^'"]*\.sendvid\.com[^'"]*\.mp4[^'"]*)/);
        if (match && match[1]) {
            console.log(`✅ URL trouvée via pattern direct`);
            return this.cleanUrl(match[1]);
        }

        // Méthode 4: Chercher dans les data attributes
        match = html.match(/data-src=['"]([^'"]*\.mp4[^'"]*)['"]/);
        if (match && match[1]) {
            console.log(`✅ URL trouvée via data-src`);
            return this.cleanUrl(match[1]);
        }

        // Méthode 5: Chercher dans le JavaScript global
        match = html.match(/videoUrl\s*[:=]\s*['"]([^'"]*\.mp4[^'"]*)['"]/);
        if (match && match[1]) {
            console.log(`✅ URL trouvée via variable JavaScript`);
            return this.cleanUrl(match[1]);
        }

        // Méthode 6: Pattern spécifique SendVid avec hash
        match = html.match(/(['"])(https?:\/\/[^'"]*\/[a-f0-9]{2}\/[a-f0-9]{2}\/[^'"]*\.mp4[^'"]*)\1/);
        if (match && match[2]) {
            console.log(`✅ URL trouvée via pattern hash SendVid`);
            return this.cleanUrl(match[2]);
        }

        // Méthode 7: Chercher toute URL MP4 (plus large)
        match = html.match(/(['"])(https?:\/\/[^'"]*\.mp4[^'"]*)\1/);
        if (match && match[2] && match[2].includes('sendvid')) {
            console.log(`✅ URL trouvée via pattern MP4 général`);
            return this.cleanUrl(match[2]);
        }

        console.log(`⚠️ Aucune URL trouvée avec les patterns habituels`);
        
        // Debug: afficher des extraits du HTML pour analyse
        console.log(`📝 Recherche de traces dans le HTML...`);
        
        const videoSection = html.match(/<video[\s\S]*?<\/video>/);
        if (videoSection) {
            console.log(`📹 Section vidéo:`, videoSection[0].substring(0, 300) + '...');
        }
        
        // Chercher toute mention de "mp4"
        const mp4Mentions = html.match(/[^'">\s]*\.mp4[^'"<\s]*/g);
        if (mp4Mentions) {
            console.log(`🔍 URLs MP4 trouvées:`, mp4Mentions);
        }

        return null;
    }

    /**
     * Nettoie et normalise l'URL
     */
    cleanUrl(url) {
        // Gérer les URLs relatives
        if (url.startsWith('//')) {
            url = 'https:' + url;
        } else if (url.startsWith('/')) {
            url = 'https://sendvid.com' + url;
        }

        // Décoder les entités HTML si nécessaire
        url = url.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

        return url;
    }

    /**
     * Vérifie si l'URL est fonctionnelle
     */
    async validateUrl(url) {
        try {
            console.log(`🧪 Test de l'URL...`);
            
            const response = await axios.head(url, {
                headers: this.headers,
                timeout: 10000,
                validateStatus: (status) => status < 400
            });

            const isValid = response.status === 200;
            const contentLength = response.headers['content-length'];
            const contentType = response.headers['content-type'];
            
            console.log(`${isValid ? '✅' : '❌'} URL ${isValid ? 'fonctionnelle' : 'non fonctionnelle'}`);
            
            if (contentLength) {
                const sizeMB = (parseInt(contentLength) / (1024 * 1024)).toFixed(2);
                console.log(`📁 Taille: ${sizeMB} MB`);
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
            
            // Essayer avec GET + Range en cas d'échec HEAD
            try {
                const response = await axios.get(url, {
                    headers: {
                        ...this.headers,
                        'Range': 'bytes=0-1023'
                    },
                    timeout: 10000,
                    responseType: 'stream'
                });

                response.data.destroy();
                
                return {
                    isValid: response.status === 206 || response.status === 200,
                    size: null,
                    contentType: response.headers['content-type']
                };

            } catch (rangeError) {
                return { isValid: false, error: error.message };
            }
        }
    }

    /**
     * Méthode alternative via embed si la page principale échoue
     */
    async getEmbedLink(videoId) {
        try {
            console.log(`🔄 Tentative via page embed...`);
            
            const embedUrl = `${this.baseUrl}/embed/${videoId}`;
            const response = await axios.get(embedUrl, {
                headers: this.headers,
                timeout: 10000
            });

            console.log(`✅ Page embed récupérée (${response.status})`);
            return this.extractVideoUrl(response.data, videoId);

        } catch (error) {
            console.warn(`⚠️ Méthode embed échouée: ${error.message}`);
            return null;
        }
    }

    /**
     * Télécharge la vidéo
     */
    async downloadVideo(videoId, outputPath = null) {
        try {
            const directUrl = await this.getDirectLink(videoId);
            const fileName = outputPath || `sendvid_video_${videoId}.mp4`;
            
            console.log(`💾 Téléchargement vers: ${fileName}`);
            
            const response = await axios({
                method: 'GET',
                url: directUrl,
                headers: this.headers,
                responseType: 'stream',
                timeout: 30000
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
     * Extrait l'ID de la vidéo depuis une URL SendVid complète
     */
    static extractVideoId(url) {
        // Gérer les URLs embed : https://sendvid.com/embed/spd4k5mz
        let match = url.match(/sendvid\.com\/embed\/([a-zA-Z0-9]+)/);
        if (match && match[1]) {
            return match[1];
        }
        
        // Gérer les URLs normales : https://sendvid.com/spd4k5mz
        match = url.match(/sendvid\.com\/([a-zA-Z0-9]+)$/);
        if (match && match[1]) {
            return match[1];
        }
        
        // Dernier recours : extraire le dernier segment
        match = url.match(/\/([a-zA-Z0-9]+)$/);
        return match ? match[1] : null;
    }
}

// Utilisation
async function main() {
    const extractor = new SendVidExtractor();
    
    try {
        // OPTION 1: Remplacez par votre ID de vidéo SendVid
        // const videoId = "spd4k5mz"; // Changez ici votre ID
        
        // OPTION 2: Utilisez directement une URL complète (ACTIVÉE)
        const fullUrl = "https://sendvid.com/embed/spd4k5mz";
        const videoId = SendVidExtractor.extractVideoId(fullUrl);
        
        console.log(`📝 URL source: ${fullUrl}`);
        console.log(`📝 ID extrait: ${videoId}`);
        
        if (!videoId) {
            throw new Error('Impossible d\'extraire l\'ID de la vidéo depuis cette URL');
        }
        
        console.log(`🚀 Démarrage de l'extraction pour SendVid...`);
        
        let directLink;
        
        try {
            directLink = await extractor.getDirectLink(videoId);
        } catch (error) {
            console.log(`🔄 Tentative via méthode embed...`);
            directLink = await extractor.getEmbedLink(videoId);
            
            if (!directLink) {
                throw new Error('Impossible d\'extraire l\'URL par les deux méthodes');
            }
        }
        
        console.log(`\n🎉 RÉSULTAT:`);
        console.log(`URL directe: ${directLink}`);
        
        console.log(`\n🔍 VÉRIFICATION:`);
        const validation = await extractor.validateUrl(directLink);
        
        if (validation.isValid) {
            console.log(`\n✅ L'URL est prête pour l'utilisation !`);
            console.log(`💡 Vous pouvez maintenant utiliser cette URL dans votre lecteur vidéo`);
            
            // Décommentez pour télécharger:
            // await extractor.downloadVideo(videoId);
        } else {
            console.log(`\n❌ L'URL nécessite des ajustements`);
            console.log(`💡 Essayez de relancer le script ou vérifiez la validité du videoId`);
        }
        
    } catch (error) {
        console.error('Échec de l\'extraction:', error.message);
        console.log(`\n💡 CONSEILS DE DÉPANNAGE:`);
        console.log(`- Vérifiez que l'ID de la vidéo est correct`);
        console.log(`- La vidéo peut être privée ou supprimée`);
        console.log(`- SendVid peut avoir changé sa structure`);
    }
}

// Fonction utilitaire pour extraire depuis une URL complète
async function extractFromUrl(fullUrl) {
    const videoId = SendVidExtractor.extractVideoId(fullUrl);
    
    if (!videoId) {
        throw new Error('Impossible d\'extraire l\'ID de la vidéo depuis cette URL');
    }
    
    console.log(`📝 ID extrait: ${videoId}`);
    
    const extractor = new SendVidExtractor();
    return await extractor.getDirectLink(videoId);
}

// EXEMPLE PRATIQUE avec votre URL
async function mainWithYourUrl() {
    try {
        // Votre URL
        const yourUrl = "https://sendvid.com/embed/spd4k5mz";
        
        console.log(`🚀 Extraction depuis: ${yourUrl}`);
        const directLink = await extractFromUrl(yourUrl);
        
        console.log(`\n🎉 RÉSULTAT:`);
        console.log(`URL directe: ${directLink}`);
        
    } catch (error) {
        console.error('Erreur:', error.message);
    }
}

// Exporter pour utilisation comme module
export default SendVidExtractor;
export { extractFromUrl };

// Exécuter si lancé directement
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main();                    // OPTION 2 activée dans main()
}
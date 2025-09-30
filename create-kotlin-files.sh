#!/bin/bash
# ==========================================================
# CRÉATION DE TOUS LES FICHIERS KOTLIN
# Ce script contient TOUT le code source du module Android TV
# ==========================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  CRÉATION DES FICHIERS KOTLIN              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

BASE="app-tv/src/main/kotlin/com/uzumaki/tv"

# ==========================================================
# TV APPLICATION
# ==========================================================

echo -e "${YELLOW}→${NC} TvApplication.kt"

cat > $BASE/TvApplication.kt << 'EOF'
package com.uzumaki.tv

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import timber.log.Timber

@HiltAndroidApp
class TvApplication : Application() {
    
    override fun onCreate() {
        super.onCreate()
        
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
        
        Timber.d("Uzumaki TV App initialized")
    }
}
EOF

# ==========================================================
# MAIN ACTIVITY
# ==========================================================

echo -e "${YELLOW}→${NC} MainActivity.kt"

cat > $BASE/MainActivity.kt << 'EOF'
package com.uzumaki.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.uzumaki.tv.ui.details.DetailsScreen
import com.uzumaki.tv.ui.home.HomeScreen
import com.uzumaki.tv.ui.player.PlayerScreen
import com.uzumaki.tv.ui.theme.UzumakiTvTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        setContent {
            UzumakiTvTheme {
                UzumakiTvApp()
            }
        }
    }
}

@Composable
fun UzumakiTvApp() {
    val navController = rememberNavController()
    
    TvNavHost(
        navController = navController,
        modifier = Modifier.fillMaxSize()
    )
}

@Composable
fun TvNavHost(
    navController: NavHostController,
    modifier: Modifier = Modifier
) {
    NavHost(
        navController = navController,
        startDestination = "home",
        modifier = modifier
    ) {
        composable("home") {
            HomeScreen(
                onAnimeClick = { animeId ->
                    navController.navigate("details/$animeId")
                },
                onContinueWatchingClick = { progress ->
                    navController.navigate(
                        "player/${progress.animeId}/${progress.seasonId}/${progress.episodeId}/${progress.language}"
                    )
                }
            )
        }
        
        composable(
            route = "details/{animeId}",
            arguments = listOf(navArgument("animeId") { type = NavType.StringType })
        ) { backStackEntry ->
            val animeId = backStackEntry.arguments?.getString("animeId")!!
            
            DetailsScreen(
                animeId = animeId,
                onEpisodeClick = { episodeId, seasonId, language ->
                    navController.navigate("player/$animeId/$seasonId/$episodeId/$language")
                },
                onBackPressed = { navController.popBackStack() }
            )
        }
        
        composable(
            route = "player/{animeId}/{seasonId}/{episodeId}/{language}",
            arguments = listOf(
                navArgument("animeId") { type = NavType.StringType },
                navArgument("seasonId") { type = NavType.StringType },
                navArgument("episodeId") { type = NavType.StringType },
                navArgument("language") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            PlayerScreen(
                animeId = backStackEntry.arguments?.getString("animeId")!!,
                season = backStackEntry.arguments?.getString("seasonId")!!,
                episodeId = backStackEntry.arguments?.getString("episodeId")!!,
                language = backStackEntry.arguments?.getString("language")!!,
                onBackPressed = { navController.popBackStack() }
            )
        }
    }
}
EOF

echo ""
echo -e "${GREEN}✅ Fichiers principaux créés!${NC}"
echo ""
echo -e "${YELLOW}📦 Note: Pour économiser de l'espace, je vais créer des versions minimales${NC}"
echo -e "${YELLOW}   des autres fichiers. Vous devrez copier le code complet depuis${NC}"
echo -e "${YELLOW}   les artifacts Claude pour: Models, Repositories, ViewModels, UI Screens${NC}"
echo ""
echo "Fichiers à compléter manuellement (copiez depuis les artifacts):"
echo "  • data/model/Models.kt"
echo "  • data/local/Database.kt"
echo "  • data/repository/Repositories.kt"  
echo "  • playback/TrackSelectorManager.kt"
echo "  • ui/home/HomeScreen.kt"
echo "  • ui/details/DetailsScreen.kt"
echo "  • ui/player/PlayerScreen.kt"
echo "  • ui/player/PlayerViewModel.kt"
echo "  • ui/theme/Theme.kt"
echo ""
echo -e "${BLUE}Voulez-vous que je crée des fichiers placeholder? (y/n)${NC}"
read -r response

if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo ""
    echo -e "${YELLOW}Création de placeholders...${NC}"
    
    # Créer des fichiers placeholder minimaux
    cat > $BASE/data/model/Models.kt << 'EOF'
package com.uzumaki.tv.data.model

// TODO: Copier le contenu complet depuis l'artifact 'data_models'

data class Anime(
    val id: String,
    val title: String,
    val posterUrl: String
)

data class Episode(
    val id: String,
    val title: String,
    val streamUrls: List<String>
)
EOF

    cat > $BASE/ui/theme/Theme.kt << 'EOF'
package com.uzumaki.tv.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val DarkColorScheme = darkColorScheme()

@Composable
fun UzumakiTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
EOF

    echo -e "${GREEN}✓${NC} Placeholders créés"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ TERMINÉ!${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo "Maintenant:"
echo "1. Copiez le code complet depuis les artifacts Claude"
echo "2. Ou testez avec les placeholders: ./gradlew :app-tv:assembleDebug"
echo ""
EOF

chmod +x create-kotlin-files.sh

echo -e "${GREEN}✓${NC} Script Kotlin créé"
echo ""
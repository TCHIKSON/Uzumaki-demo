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

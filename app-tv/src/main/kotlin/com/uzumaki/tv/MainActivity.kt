package com.uzumaki.tv

import android.os.Bundle
import android.net.Uri
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
                onAnimeClick = { slug ->
                    navController.navigate("details/${Uri.encode(slug)}")
                },
                onContinueWatchingClick = { progress ->
                    navController.navigate(
                        "player/${progress.animeId}/${progress.seasonId}/${progress.episodeId}/${progress.language}"
                    )
                }
            )
        }

        composable(
            route = "details/{slug}",
            arguments = listOf(navArgument("slug") { type = NavType.StringType })
        ) { backStackEntry ->
            val slug = backStackEntry.arguments?.getString("slug")!!

            DetailsScreen(
                slug = slug,
                onEpisodeClick = { episodeId, seasonId, language ->
                    navController.navigate("player/${Uri.encode(slug)}/${Uri.encode(seasonId)}/${Uri.encode(episodeId)}/${Uri.encode(language)}")
                },
                onBackPressed = { navController.popBackStack() }
            )
        }

        composable(
            route = "player/{slug}/{seasonId}/{episodeId}/{language}",
            arguments = listOf(
                navArgument("slug") { type = NavType.StringType },
                navArgument("seasonId") { type = NavType.StringType },
                navArgument("episodeId") { type = NavType.StringType },
                navArgument("language") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            PlayerScreen(
                slug = backStackEntry.arguments?.getString("slug")!!,
                season = backStackEntry.arguments?.getString("seasonId")!!,
                episodeId = backStackEntry.arguments?.getString("episodeId")!!,
                language = backStackEntry.arguments?.getString("language")!!,
                onBackPressed = { navController.popBackStack() }
            )
        }
    }
}

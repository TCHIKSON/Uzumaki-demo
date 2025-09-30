package com.uzumaki.tv.ui.details

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

@Composable
fun DetailsScreen(
    animeId: String,
    onEpisodeClick: (String, String, String) -> Unit,
    onBackPressed: () -> Unit
) {
    BackHandler { onBackPressed() }
    
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Details Screen", style = MaterialTheme.typography.displaySmall)
            Text("Anime ID: $animeId")
            Button(onClick = onBackPressed) { Text("Back") }
        }
    }
}

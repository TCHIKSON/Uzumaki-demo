package com.uzumaki.tv.ui.player

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

@Composable
fun PlayerScreen(
    animeId: String,
    season: String,
    episodeId: String,
    language: String,
    onBackPressed: () -> Unit
) {
    BackHandler { onBackPressed() }
    
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Player Screen", style = MaterialTheme.typography.displaySmall)
            Text("Playing: $animeId - S$season E$episodeId ($language)")
            Button(onClick = onBackPressed) { Text("Back") }
        }
    }
}

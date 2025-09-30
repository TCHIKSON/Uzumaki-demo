@file:OptIn(androidx.media3.common.util.UnstableApi::class)
package com.uzumaki.tv.ui.player

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.media3.ui.PlayerView
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.material3.ExperimentalTvMaterial3Api
import com.uzumaki.tv.data.model.Episode
import com.uzumaki.tv.data.model.PlayerState
import java.util.concurrent.TimeUnit

@Composable
fun PlayerScreen(
    slug: String,
    season: String,
    episodeId: String,
    language: String,
    onBackPressed: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: PlayerViewModel = hiltViewModel()
) {
    val playerState by viewModel.playerState.collectAsState()
    val context = LocalContext.current
    
    LaunchedEffect(slug, season, episodeId, language) {
        viewModel.initializePlayer(slug, season, episodeId, language)
    }
    
    BackHandler {
        viewModel.onBackPressed(onBackPressed)
    }
    
    Box(modifier = modifier.fillMaxSize()) {
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    player = viewModel.exoPlayer
                    useController = false
                    setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS)
                }
            },
            modifier = Modifier.fillMaxSize()
        )
        
        AnimatedVisibility(
            visible = playerState.showControls,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            PlayerControls(
                playerState = playerState,
                onPlayPause = viewModel::togglePlayPause,
                onSeek = viewModel::seekTo,
                onNextEpisode = viewModel::playNextEpisode,
                onPreviousEpisode = viewModel::playPreviousEpisode,
                onShowQueue = viewModel::toggleQueuePanel,
                onShowLanguageSelector = viewModel::toggleLanguageSelector,
                onShowControls = viewModel::showControls
            )
        }
        
        if (playerState.showQueue) {
            EpisodeQueuePanel(
                episodes = playerState.queueEpisodes,
                currentEpisode = playerState.currentEpisode,
                onEpisodeClick = viewModel::playEpisode,
                onDismiss = viewModel::hideQueuePanel
            )
        }
        
        if (playerState.showLanguageSelector) {
            LanguageSelectorPanel(
                availableLanguages = playerState.availableLanguages,
                currentLanguage = playerState.currentLanguage,
                onLanguageSelect = viewModel::changeLanguage,
                onDismiss = viewModel::hideLanguageSelector
            )
        }
        
        if (playerState.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.7f)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }
        
        playerState.error?.let { error ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.8f)),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text("Erreur", style = MaterialTheme.typography.headlineMedium, color = Color.White)
                    Text(error, style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(0.7f))
                    Button(onClick = onBackPressed) { Text("Retour") }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun PlayerControls(
    playerState: PlayerState,
    onPlayPause: () -> Unit,
    onSeek: (Long) -> Unit,
    onNextEpisode: () -> Unit,
    onPreviousEpisode: () -> Unit,
    onShowQueue: () -> Unit,
    onShowLanguageSelector: () -> Unit,
    onShowControls: () -> Unit,
    modifier: Modifier = Modifier
) {
    LaunchedEffect(Unit) {
        onShowControls()
    }
    
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f))
            .padding(48.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.TopStart),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = playerState.animeTitle,
                    style = MaterialTheme.typography.headlineSmall,
                    color = Color.White
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = playerState.episodeTitle,
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color.White.copy(alpha = 0.7f)
                )
            }
            
            Surface(
                onClick = onShowLanguageSelector,
                color = MaterialTheme.colorScheme.primary,
                shape = RoundedCornerShape(4.dp)
            ) {
                Text(
                    text = playerState.currentLanguage,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                    color = Color.White,
                    style = MaterialTheme.typography.titleMedium
                )
            }
        }
        
        Column(
            modifier = Modifier.align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(24.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(
                    onClick = onPreviousEpisode,
                    enabled = playerState.hasPreviousEpisode,
                    modifier = Modifier.size(64.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.SkipPrevious,
                        contentDescription = "Previous Episode",
                        modifier = Modifier.size(40.dp),
                        tint = if (playerState.hasPreviousEpisode) Color.White else Color.Gray
                    )
                }
                
                IconButton(
                    onClick = { onSeek(playerState.currentPosition - 10_000) },
                    modifier = Modifier.size(64.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Replay10,
                        contentDescription = "Rewind 10s",
                        modifier = Modifier.size(40.dp),
                        tint = Color.White
                    )
                }
                
                IconButton(
                    onClick = onPlayPause,
                    modifier = Modifier.size(80.dp)
                ) {
                    Icon(
                        imageVector = if (playerState.isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                        contentDescription = if (playerState.isPlaying) "Pause" else "Play",
                        modifier = Modifier.size(56.dp),
                        tint = Color.White
                    )
                }
                
                IconButton(
                    onClick = { onSeek(playerState.currentPosition + 10_000) },
                    modifier = Modifier.size(64.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Forward10,
                        contentDescription = "Forward 10s",
                        modifier = Modifier.size(40.dp),
                        tint = Color.White
                    )
                }
                
                IconButton(
                    onClick = onNextEpisode,
                    enabled = playerState.hasNextEpisode,
                    modifier = Modifier.size(64.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.SkipNext,
                        contentDescription = "Next Episode",
                        modifier = Modifier.size(40.dp),
                        tint = if (playerState.hasNextEpisode) Color.White else Color.Gray
                    )
                }
            }
        }
        
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .align(Alignment.BottomStart)
        ) {
            TimelineRow(
                currentPosition = playerState.currentPosition,
                duration = playerState.duration,
                bufferedPercentage = playerState.bufferedPercentage,
                onSeek = onSeek
            )
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                TextButton(onClick = onShowQueue) {
                    Icon(Icons.Default.QueueMusic, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Épisodes (${playerState.queueSize})")
                }
                
                TextButton(onClick = { }) {
                    Icon(Icons.Default.Settings, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Paramètres")
                }
            }
        }
    }
}

@Composable
fun TimelineRow(
    currentPosition: Long,
    duration: Long,
    bufferedPercentage: Int,
    onSeek: (Long) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = formatTime(currentPosition),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White
            )
            Text(
                text = formatTime(duration),
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.7f)
            )
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .background(Color.White.copy(alpha = 0.3f), RoundedCornerShape(4.dp))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(bufferedPercentage / 100f)
                    .background(Color.White.copy(alpha = 0.5f), RoundedCornerShape(4.dp))
            )
            
            val progress = if (duration > 0) currentPosition.toFloat() / duration else 0f
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(progress)
                    .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(4.dp))
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun EpisodeQueuePanel(
    episodes: List<Episode>,
    currentEpisode: Episode?,
    onEpisodeClick: (Episode) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    BackHandler { onDismiss() }
    
    Surface(
        modifier = modifier
            .fillMaxHeight()
            .width(450.dp),
        color = Color.Black.copy(alpha = 0.95f)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(32.dp)
        ) {
            Text(
                text = "File d'attente",
                style = MaterialTheme.typography.headlineSmall,
                color = Color.White
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            TvLazyColumn(
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(episodes.size) { index ->
                    val episode = episodes[index]
                    QueueEpisodeItem(
                        episode = episode,
                        isPlaying = episode.id == currentEpisode?.id,
                        onClick = { onEpisodeClick(episode) }
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun QueueEpisodeItem(
    episode: Episode,
    isPlaying: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    androidx.tv.material3.Card(
        onClick = onClick,
        modifier = modifier.fillMaxWidth(),
        colors = androidx.tv.material3.CardDefaults.colors(
            containerColor = if (isPlaying) 
                MaterialTheme.colorScheme.primary.copy(alpha = 0.3f) 
            else 
                Color.Transparent
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isPlaying) {
                Icon(
                    imageVector = Icons.Default.PlayArrow,
                    contentDescription = "Playing",
                    tint = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.width(12.dp))
            }
            
            Column {
                Text(
                    text = episode.title,
                    style = MaterialTheme.typography.titleSmall,
                    color = Color.White
                )
                Text(
                    text = "Épisode ${episode.episodeNumber}",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.6f)
                )
            }
        }
    }
}

@Composable
fun LanguageSelectorPanel(
    availableLanguages: List<String>,
    currentLanguage: String,
    onLanguageSelect: (String) -> Unit,
    onDismiss: () -> Unit
) {
    BackHandler { onDismiss() }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Sélectionner la langue") },
        text = {
            Column {
                availableLanguages.forEach { lang ->
                    ListItem(
                        headlineContent = {
                            Text(
                                text = when (lang) {
                                    "VF" -> "Version française (VF)"
                                    "VOSTFR" -> "Version originale sous-titrée (VOSTFR)"
                                    else -> lang
                                }
                            )
                        },
                        leadingContent = {
                            RadioButton(
                                selected = lang == currentLanguage,
                                onClick = null
                            )
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onLanguageSelect(lang) }
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Fermer")
            }
        }
    )
}

private fun formatTime(timeMs: Long): String {
    if (timeMs <= 0) return "0:00"
    
    val hours = TimeUnit.MILLISECONDS.toHours(timeMs)
    val minutes = TimeUnit.MILLISECONDS.toMinutes(timeMs) % 60
    val seconds = TimeUnit.MILLISECONDS.toSeconds(timeMs) % 60
    
    return if (hours > 0) {
        String.format("%d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format("%d:%02d", minutes, seconds)
    }
}

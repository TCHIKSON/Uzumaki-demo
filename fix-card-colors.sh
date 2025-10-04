#!/bin/bash
set -e

echo "🔧 Correction de Card colors dans DetailsScreen..."

BASE="app-tv/src/main/kotlin/com/uzumaki/tv"

# La correction : utiliser Card sans paramètre colors, et styliser via le modifier
cat > "$BASE/ui/details/DetailsScreen.kt" << 'FIXEOF'
package com.uzumaki.tv.ui.details

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.material3.Card
import androidx.tv.material3.ExperimentalTvMaterial3Api
import coil.compose.AsyncImage
import com.uzumaki.tv.data.model.AnimeDetails
import com.uzumaki.tv.data.model.Episode
import com.uzumaki.tv.data.repository.CatalogRepository
import com.uzumaki.tv.data.repository.SettingsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@HiltViewModel
class DetailsViewModel @Inject constructor(
    private val catalogRepository: CatalogRepository,
    private val settingsRepository: SettingsRepository
) : ViewModel() {
    
    private val _uiState = MutableStateFlow<DetailsUiState>(DetailsUiState.Loading)
    val uiState: StateFlow<DetailsUiState> = _uiState.asStateFlow()
    
    private val _selectedSeason = MutableStateFlow(0)
    val selectedSeason: StateFlow<Int> = _selectedSeason.asStateFlow()
    
    private val _selectedLanguage = MutableStateFlow("VOSTFR")
    val selectedLanguage: StateFlow<String> = _selectedLanguage.asStateFlow()
    
    fun loadAnimeDetails(animeId: String) {
        viewModelScope.launch {
            _uiState.value = DetailsUiState.Loading
            
            try {
                val animeResult = catalogRepository.getAnimeDetails(animeId)
                if (animeResult.isFailure) {
                    _uiState.value = DetailsUiState.Error("Failed to load anime")
                    return@launch
                }
                
                val anime = animeResult.getOrNull()!!
                val preferredLanguage = settingsRepository.getPreferredLanguage()
                _selectedLanguage.value = if (anime.availableLanguages.contains(preferredLanguage)) {
                    preferredLanguage
                } else {
                    anime.availableLanguages.firstOrNull() ?: "VOSTFR"
                }
                
                loadEpisodesForSeason(anime, 0, _selectedLanguage.value)
                
            } catch (e: Exception) {
                Timber.e(e, "Error loading anime details")
                _uiState.value = DetailsUiState.Error(e.message ?: "Unknown error")
            }
        }
    }
    
    fun selectSeason(seasonIndex: Int) {
        val state = _uiState.value as? DetailsUiState.Success ?: return
        _selectedSeason.value = seasonIndex
        loadEpisodesForSeason(state.anime, seasonIndex, _selectedLanguage.value)
    }
    
    fun selectLanguage(language: String) {
        val state = _uiState.value as? DetailsUiState.Success ?: return
        _selectedLanguage.value = language
        loadEpisodesForSeason(state.anime, _selectedSeason.value, language)
    }
    
    private fun loadEpisodesForSeason(anime: AnimeDetails, seasonIndex: Int, language: String) {
        viewModelScope.launch {
            try {
                val season = anime.seasons.getOrNull(seasonIndex) ?: return@launch
                val seasonNumber = seasonIndex + 1
                
                val episodesResult = catalogRepository.getEpisodesForSeason(anime.slug, seasonNumber, language)
                
                if (episodesResult.isSuccess) {
                    val episodes = episodesResult.getOrNull()!!
                    _uiState.value = DetailsUiState.Success(anime, episodes)
                }
            } catch (e: Exception) {
                Timber.e(e, "Error loading episodes")
            }
        }
    }
}

sealed class DetailsUiState {
    object Loading : DetailsUiState()
    data class Success(val anime: AnimeDetails, val currentEpisodes: List<Episode>) : DetailsUiState()
    data class Error(val message: String) : DetailsUiState()
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun DetailsScreen(
    animeId: String,
    onEpisodeClick: (String, String, String) -> Unit,
    onBackPressed: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: DetailsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val selectedSeason by viewModel.selectedSeason.collectAsState()
    val selectedLanguage by viewModel.selectedLanguage.collectAsState()
    
    LaunchedEffect(animeId) {
        viewModel.loadAnimeDetails(animeId)
    }
    
    BackHandler { onBackPressed() }
    
    Box(modifier = modifier.fillMaxSize()) {
        when (val state = uiState) {
            is DetailsUiState.Loading -> {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            }
            is DetailsUiState.Success -> {
                DetailsContent(
                    anime = state.anime,
                    episodes = state.currentEpisodes,
                    selectedSeason = selectedSeason,
                    selectedLanguage = selectedLanguage,
                    onSeasonSelected = viewModel::selectSeason,
                    onLanguageSelected = viewModel::selectLanguage,
                    onEpisodeClick = { episode ->
                        onEpisodeClick(episode.id, episode.seasonId, selectedLanguage)
                    }
                )
            }
            is DetailsUiState.Error -> {
                Column(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(state.message)
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = onBackPressed) { Text("Retour") }
                }
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun DetailsContent(
    anime: AnimeDetails,
    episodes: List<Episode>,
    selectedSeason: Int,
    selectedLanguage: String,
    onSeasonSelected: (Int) -> Unit,
    onLanguageSelected: (String) -> Unit,
    onEpisodeClick: (Episode) -> Unit
) {
    TvLazyColumn(
        modifier = Modifier.fillMaxSize().padding(vertical = 27.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp)
    ) {
        item {
            Box(modifier = Modifier.fillMaxWidth().height(400.dp)) {
                AsyncImage(
                    model = anime.posterUrl,
                    contentDescription = null,
                    modifier = Modifier.fillMaxSize()
                )
                
                Box(
                    modifier = Modifier.fillMaxSize().background(
                        Brush.verticalGradient(
                            colors = listOf(Color.Transparent, Color.Black.copy(0.7f), Color.Black)
                        )
                    )
                )
                
                Column(
                    modifier = Modifier.align(Alignment.BottomStart).padding(48.dp)
                ) {
                    Text(
                        text = anime.title,
                        style = MaterialTheme.typography.displaySmall,
                        color = Color.White
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        anime.genres.take(3).forEach { genre ->
                            Surface(
                                color = MaterialTheme.colorScheme.primary.copy(alpha = 0.3f),
                                shape = RoundedCornerShape(4.dp)
                            ) {
                                Text(
                                    text = genre,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                    color = Color.White
                                )
                            }
                        }
                    }
                }
            }
        }
        
        item {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 48.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                if (anime.seasons.size > 1) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Saison", style = MaterialTheme.typography.titleSmall)
                        Spacer(modifier = Modifier.height(8.dp))
                        TvLazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(anime.seasons.size) { index ->
                                Button(
                                    onClick = { onSeasonSelected(index) },
                                    colors = ButtonDefaults.colors(
                                        containerColor = if (index == selectedSeason)
                                            MaterialTheme.colorScheme.primary
                                        else
                                            MaterialTheme.colorScheme.surfaceVariant
                                    )
                                ) {
                                    Text(anime.seasons[index].name)
                                }
                            }
                        }
                    }
                }
                
                Column(modifier = Modifier.weight(1f)) {
                    Text("Langue", style = MaterialTheme.typography.titleSmall)
                    Spacer(modifier = Modifier.height(8.dp))
                    TvLazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(anime.availableLanguages.size) { index ->
                            val language = anime.availableLanguages[index]
                            Button(
                                onClick = { onLanguageSelected(language) },
                                colors = ButtonDefaults.colors(
                                    containerColor = if (language == selectedLanguage)
                                        MaterialTheme.colorScheme.primary
                                    else
                                        MaterialTheme.colorScheme.surfaceVariant
                                )
                            ) {
                                Text(language)
                            }
                        }
                    }
                }
            }
        }
        
        item {
            Column(modifier = Modifier.padding(horizontal = 48.dp)) {
                Text(
                    text = "Épisodes (${episodes.size})",
                    style = MaterialTheme.typography.headlineSmall
                )
                Spacer(modifier = Modifier.height(16.dp))
                episodes.forEach { episode ->
                    Card(
                        onClick = { onEpisodeClick(episode) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(80.dp)
                            .padding(bottom = 12.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                color = MaterialTheme.colorScheme.primary,
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.size(48.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = Icons.Default.PlayArrow,
                                        contentDescription = "Play",
                                        tint = Color.White
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.width(16.dp))
                            Column {
                                Text(
                                    text = episode.title,
                                    style = MaterialTheme.typography.titleMedium
                                )
                                Text(
                                    text = "Épisode ${episode.episodeNumber}",
                                    style = MaterialTheme.typography.bodySmall
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
FIXEOF

echo "✅ Card colors corrigé!"
echo ""
echo "Rebuild dans Android Studio maintenant!"
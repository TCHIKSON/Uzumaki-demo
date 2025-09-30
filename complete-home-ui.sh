#!/bin/bash
set -e

echo "Amélioration UI du HomeScreen..."

BASE="app-tv/src/main/kotlin/com/uzumaki/tv"

cat > "$BASE/ui/home/HomeScreen.kt" << 'HOMEEOF'
package com.uzumaki.tv.ui.home

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.tv.foundation.lazy.list.TvLazyColumn
import androidx.tv.foundation.lazy.list.TvLazyRow
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.ExperimentalTvMaterial3Api
import coil.compose.AsyncImage
import com.uzumaki.tv.data.model.Anime
import com.uzumaki.tv.data.model.WatchProgress
import com.uzumaki.tv.data.repository.CatalogRepository
import com.uzumaki.tv.data.repository.WatchProgressRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val catalogRepository: CatalogRepository,
    watchProgressRepository: WatchProgressRepository
) : ViewModel() {
    
    private val _uiState = MutableStateFlow<HomeUiState>(HomeUiState.Loading)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()
    
    val continueWatching = watchProgressRepository.getContinueWatching()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())
    
    init {
        loadCatalog()
    }
    
    fun loadCatalog() {
        viewModelScope.launch {
            _uiState.value = HomeUiState.Loading
            val result = catalogRepository.getCatalog()
            _uiState.value = if (result.isSuccess) {
                HomeUiState.Success(result.getOrNull()!!)
            } else {
                HomeUiState.Error(result.exceptionOrNull()?.message ?: "Error")
            }
        }
    }
}

sealed class HomeUiState {
    object Loading : HomeUiState()
    data class Success(val catalog: List<Anime>) : HomeUiState()
    data class Error(val message: String) : HomeUiState()
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun HomeScreen(
    onAnimeClick: (String) -> Unit,
    onContinueWatchingClick: (WatchProgress) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val continueWatching by viewModel.continueWatching.collectAsState()
    var showExitDialog by remember { mutableStateOf(false) }
    
    BackHandler { showExitDialog = true }
    
    Box(modifier = modifier.fillMaxSize()) {
        when (val state = uiState) {
            is HomeUiState.Loading -> {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            }
            is HomeUiState.Success -> {
                HomeContent(
                    catalog = state.catalog,
                    continueWatching = continueWatching,
                    onAnimeClick = onAnimeClick,
                    onContinueWatchingClick = onContinueWatchingClick
                )
            }
            is HomeUiState.Error -> {
                Column(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(state.message)
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = viewModel::loadCatalog) { Text("Réessayer") }
                }
            }
        }
        
        if (showExitDialog) {
            AlertDialog(
                onDismissRequest = { showExitDialog = false },
                title = { Text("Quitter Uzumaki TV ?") },
                confirmButton = {
                    TextButton(onClick = { 
                        android.os.Process.killProcess(android.os.Process.myPid())
                    }) { Text("Quitter") }
                },
                dismissButton = {
                    TextButton(onClick = { showExitDialog = false }) { Text("Annuler") }
                }
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun HomeContent(
    catalog: List<Anime>,
    continueWatching: List<WatchProgress>,
    onAnimeClick: (String) -> Unit,
    onContinueWatchingClick: (WatchProgress) -> Unit
) {
    TvLazyColumn(
        modifier = Modifier.fillMaxSize().padding(vertical = 27.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp)
    ) {
        item {
            Text(
                text = "Uzumaki TV",
                style = MaterialTheme.typography.displayMedium,
                modifier = Modifier.padding(horizontal = 48.dp)
            )
        }
        
        if (continueWatching.isNotEmpty()) {
            item {
                Column {
                    Text(
                        text = "Reprendre la lecture",
                        style = MaterialTheme.typography.headlineSmall,
                        modifier = Modifier.padding(horizontal = 48.dp, vertical = 8.dp)
                    )
                    ContinueWatchingRow(
                        items = continueWatching,
                        onItemClick = onContinueWatchingClick
                    )
                }
            }
        }
        
        item {
            Column {
                Text(
                    text = "Catalogue",
                    style = MaterialTheme.typography.headlineSmall,
                    modifier = Modifier.padding(horizontal = 48.dp, vertical = 8.dp)
                )
                CatalogGrid(
                    items = catalog,
                    onItemClick = { anime -> onAnimeClick(anime.id.oid) }
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ContinueWatchingRow(
    items: List<WatchProgress>,
    onItemClick: (WatchProgress) -> Unit
) {
    TvLazyRow(
        modifier = Modifier.padding(horizontal = 48.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        items(items.size) { index ->
            ContinueWatchingCard(
                progress = items[index],
                onClick = { onItemClick(items[index]) }
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun ContinueWatchingCard(
    progress: WatchProgress,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.size(width = 320.dp, height = 180.dp),
        scale = CardDefaults.scale(focusedScale = 1.1f)
    ) {
        Box {
            AsyncImage(
                model = progress.animePosterUrl,
                contentDescription = progress.animeTitle,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
            
            Column(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .padding(12.dp)
            ) {
                Text(
                    text = progress.animeTitle,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    color = Color.White
                )
                Text(
                    text = progress.episodeTitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = Color.White.copy(alpha = 0.7f)
                )
                Spacer(modifier = Modifier.height(4.dp))
                LinearProgressIndicator(
                    progress = progress.getProgressPercentage(),
                    modifier = Modifier.fillMaxWidth().height(4.dp)
                )
            }
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun CatalogGrid(
    items: List<Anime>,
    onItemClick: (Anime) -> Unit
) {
    androidx.tv.foundation.lazy.grid.TvLazyVerticalGrid(
        columns = androidx.tv.foundation.lazy.grid.TvGridCells.Fixed(6),
        modifier = Modifier.padding(horizontal = 48.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        items(items.size) { index ->
            AnimeCard(
                anime = items[index],
                onClick = { onItemClick(items[index]) }
            )
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
fun AnimeCard(
    anime: Anime,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.aspectRatio(0.7f),
        scale = CardDefaults.scale(focusedScale = 1.15f)
    ) {
        Box {
            AsyncImage(
                model = anime.image,
                contentDescription = anime.title,
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Crop
            )
            
            Text(
                text = anime.title,
                style = MaterialTheme.typography.labelSmall,
                maxLines = 2,
                color = Color.White,
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .padding(8.dp)
            )
        }
    }
}
HOMEEOF

echo "HomeScreen UI complet créé!"
echo ""
echo "Commit et push:"
echo "  git add ."
echo "  git commit -m 'feat(tv): complete HomeScreen UI with cards grid and carousel'"
echo "  git push origin dev-plus"
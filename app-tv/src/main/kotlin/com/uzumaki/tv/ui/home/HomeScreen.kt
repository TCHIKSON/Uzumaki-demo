package com.uzumaki.tv.ui.home

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.tv.foundation.lazy.list.TvLazyColumn
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

@Composable
fun HomeScreen(
    onAnimeClick: (String) -> Unit,
    onContinueWatchingClick: (WatchProgress) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var showExitDialog by remember { mutableStateOf(false) }
    
    BackHandler { showExitDialog = true }
    
    Box(modifier = modifier.fillMaxSize()) {
        when (val state = uiState) {
            is HomeUiState.Loading -> {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            }
            is HomeUiState.Success -> {
                TvLazyColumn(
                    modifier = Modifier.fillMaxSize().padding(48.dp),
                    verticalArrangement = Arrangement.spacedBy(24.dp)
                ) {
                    item {
                        Text("Uzumaki TV", style = MaterialTheme.typography.displayMedium)
                    }
                    item {
                        Text("Catalogue: ${state.catalog.size} anime(s)")
                    }
                }
            }
            is HomeUiState.Error -> {
                Column(
                    modifier = Modifier.align(Alignment.Center),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(state.message)
                    Button(onClick = viewModel::loadCatalog) { Text("Retry") }
                }
            }
        }
        
        if (showExitDialog) {
            AlertDialog(
                onDismissRequest = { showExitDialog = false },
                title = { Text("Quitter ?") },
                confirmButton = {
                    TextButton(onClick = { android.os.Process.killProcess(android.os.Process.myPid()) }) {
                        Text("Quitter")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showExitDialog = false }) { Text("Annuler") }
                }
            )
        }
    }
}

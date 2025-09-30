#!/bin/bash
# ================================================================
# INSTALLATEUR UI + DI + PLAYBACK COMPLET
# ================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  INSTALLATION UI + DI + PLAYBACK          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

BASE="app-tv/src/main/kotlin/com/uzumaki/tv"

# ================================================================
# HILT DI MODULES
# ================================================================

echo -e "${YELLOW}→${NC} di/AppModule.kt"

cat > "$BASE/di/AppModule.kt" << 'DIEOF'
package com.uzumaki.tv.di

import android.content.Context
import androidx.media3.exoplayer.ExoPlayer
import androidx.room.Room
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.uzumaki.tv.data.local.UzumakiDatabase
import com.uzumaki.tv.data.remote.UzumakiApiService
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    
    @Provides
    @Singleton
    fun provideGson(): Gson = GsonBuilder().setLenient().create()
    
    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply { 
            level = HttpLoggingInterceptor.Level.BODY 
        }
        return OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }
    
    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient, gson: Gson): Retrofit {
        return Retrofit.Builder()
            .baseUrl("https://your-api-url.com/")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }
    
    @Provides
    @Singleton
    fun provideApiService(retrofit: Retrofit): UzumakiApiService =
        retrofit.create(UzumakiApiService::class.java)
    
    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): UzumakiDatabase {
        return Room.databaseBuilder(
            context,
            UzumakiDatabase::class.java,
            UzumakiDatabase.DATABASE_NAME
        ).fallbackToDestructiveMigration().build()
    }
    
    @Provides
    @Singleton
    fun provideWatchProgressDao(db: UzumakiDatabase) = db.watchProgressDao()
    
    @Provides
    @Singleton
    fun provideUserPreferencesDao(db: UzumakiDatabase) = db.userPreferencesDao()
    
    @Provides
    @Singleton
    fun provideExoPlayer(@ApplicationContext context: Context): ExoPlayer {
        return ExoPlayer.Builder(context)
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build()
    }
}
DIEOF

echo -e "${GREEN}✓${NC} AppModule.kt créé"

# ================================================================
# PLAYBACK (BUGFIX VF/VOSTFR)
# ================================================================

echo -e "${YELLOW}→${NC} playback/TrackSelectorManager.kt (BUGFIX)"

cat > "$BASE/playback/TrackSelectorManager.kt" << 'TRACKEOF'
package com.uzumaki.tv.playback

import androidx.media3.common.C
import androidx.media3.exoplayer.ExoPlayer
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TrackSelectorManager @Inject constructor(
    private val exoPlayer: ExoPlayer
) {
    fun applyLanguagePreference(language: String) {
        Timber.d("Applying language preference: $language")
        
        val params = exoPlayer.trackSelectionParameters.buildUpon().apply {
            when (language) {
                "VF" -> {
                    setPreferredAudioLanguage("fra")
                    setPreferredAudioLanguages("fra", "fr", "fre")
                    setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                    setPreferredTextLanguage(null)
                    Timber.d("VF mode: French audio, subtitles disabled")
                }
                "VOSTFR" -> {
                    setPreferredAudioLanguage("jpn")
                    setPreferredAudioLanguages("jpn", "ja", "jap")
                    setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                    setPreferredTextLanguage("fra")
                    setPreferredTextLanguages("fra", "fr", "fre")
                    setPreferredTextRoleFlags(C.ROLE_FLAG_SUBTITLE)
                    Timber.d("VOSTFR mode: Japanese audio, French subtitles")
                }
            }
        }.build()
        
        exoPlayer.trackSelectionParameters = params
    }
}
TRACKEOF

echo -e "${GREEN}✓${NC} TrackSelectorManager.kt créé (BUGFIX VF/VOSTFR)"

echo -e "${YELLOW}→${NC} playback/UzumakiPlayerService.kt"

cat > "$BASE/playback/UzumakiPlayerService.kt" << 'SERVICEEOF'
package com.uzumaki.tv.playback

import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import dagger.hilt.android.AndroidEntryPoint
import timber.log.Timber
import javax.inject.Inject

@AndroidEntryPoint
class UzumakiPlayerService : MediaSessionService() {
    
    @Inject
    lateinit var exoPlayer: ExoPlayer
    
    private var mediaSession: MediaSession? = null
    
    override fun onCreate() {
        super.onCreate()
        Timber.d("UzumakiPlayerService created")
        mediaSession = MediaSession.Builder(this, exoPlayer).build()
    }
    
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }
    
    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        super.onDestroy()
    }
}
SERVICEEOF

echo -e "${GREEN}✓${NC} UzumakiPlayerService.kt créé"

# ================================================================
# THEME
# ================================================================

echo -e "${YELLOW}→${NC} ui/theme/Theme.kt"

cat > "$BASE/ui/theme/Theme.kt" << 'THEMEEOF'
package com.uzumaki.tv.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF6200EE),
    secondary = Color(0xFF03DAC6),
    background = Color(0xFF121212),
    surface = Color(0xFF1E1E1E)
)

@Composable
fun UzumakiTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
THEMEEOF

echo -e "${GREEN}✓${NC} Theme.kt créé"

# ================================================================
# HOME SCREEN
# ================================================================

echo -e "${YELLOW}→${NC} ui/home/HomeScreen.kt"

cat > "$BASE/ui/home/HomeScreen.kt" << 'HOMEEOF'
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
HOMEEOF

echo -e "${GREEN}✓${NC} HomeScreen.kt créé"

# ================================================================
# DETAILS & PLAYER STUBS
# ================================================================

echo -e "${YELLOW}→${NC} ui/details/DetailsScreen.kt (stub)"

cat > "$BASE/ui/details/DetailsScreen.kt" << 'DETAILSEOF'
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
DETAILSEOF

echo -e "${GREEN}✓${NC} DetailsScreen.kt créé (stub)"

echo -e "${YELLOW}→${NC} ui/player/PlayerScreen.kt (stub)"

cat > "$BASE/ui/player/PlayerScreen.kt" << 'PLAYEREOF'
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
PLAYEREOF

echo -e "${GREEN}✓${NC} PlayerScreen.kt créé (stub)"

echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ TOUS LES FICHIERS CRÉÉS!${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo "Fichiers créés:"
echo "  ✓ DI: AppModule.kt"
echo "  ✓ Playback: TrackSelectorManager.kt (BUGFIX VF/VOSTFR)"
echo "  ✓ Playback: UzumakiPlayerService.kt"
echo "  ✓ Theme: Theme.kt"
echo "  ✓ UI: HomeScreen.kt (complet)"
echo "  ✓ UI: DetailsScreen.kt (stub)"
echo "  ✓ UI: PlayerScreen.kt (stub)"
echo ""
echo -e "${YELLOW}⚠${NC} DetailsScreen et PlayerScreen sont des stubs pour que ça compile"
echo ""
echo "Maintenant TESTEZ:"
echo "  ${GREEN}./gradlew :app-tv:assembleDebug${NC}"
echo ""
echo "Si ça compile, on peut:"
echo "  1. Commiter et pusher"
echo "  2. Ou compléter les screens Details & Player"
echo ""
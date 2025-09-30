package com.uzumaki.tv.ui.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.uzumaki.tv.data.model.*
import com.uzumaki.tv.data.repository.CatalogRepository
import com.uzumaki.tv.data.repository.SettingsRepository
import com.uzumaki.tv.data.repository.WatchProgressRepository
import com.uzumaki.tv.playback.TrackSelectorManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@HiltViewModel
class PlayerViewModel @Inject constructor(
    val exoPlayer: ExoPlayer,
    private val catalogRepository: CatalogRepository,
    private val watchProgressRepository: WatchProgressRepository,
    private val settingsRepository: SettingsRepository,
    private val trackSelectorManager: TrackSelectorManager
) : ViewModel() {
    
    private val _playerState = MutableStateFlow(PlayerState())
    val playerState: StateFlow<PlayerState> = _playerState.asStateFlow()
    
    private var progressSaveJob: Job? = null
    private var controlsHideJob: Job? = null
    private var currentProgressId: String? = null
    
    init {
        setupPlayerListener()
        startProgressTracking()
    }
    
    fun initializePlayer(animeId: String, seasonId: String, episodeId: String, language: String) {
        viewModelScope.launch {
            _playerState.update { it.copy(isLoading = true, error = null) }
            
            try {
                val animeResult = catalogRepository.getAnimeDetails(animeId)
                if (animeResult.isFailure) {
                    _playerState.update { it.copy(isLoading = false, error = "Failed to load anime") }
                    return@launch
                }
                
                val anime = animeResult.getOrNull()!!
                val season = seasonId.removePrefix("season_").toInt()
                val episodesResult = catalogRepository.getEpisodesForSeason(anime.slug, season, language)
                
                if (episodesResult.isFailure) {
                    _playerState.update { it.copy(isLoading = false, error = "Failed to load episodes") }
                    return@launch
                }
                
                val episodes = episodesResult.getOrNull()!!
                val currentEpisode = episodes.find { it.id == episodeId }
                
                if (currentEpisode == null) {
                    _playerState.update { it.copy(isLoading = false, error = "Episode not found") }
                    return@launch
                }
                
                val currentIndex = episodes.indexOf(currentEpisode)
                _playerState.update {
                    it.copy(
                        currentAnime = anime,
                        currentSeason = anime.seasons.find { s -> s.id == seasonId },
                        currentEpisode = currentEpisode,
                        currentLanguage = language,
                        availableLanguages = anime.availableLanguages,
                        queueEpisodes = episodes,
                        currentEpisodeIndex = currentIndex,
                        isLoading = false
                    )
                }
                
                loadStream(currentEpisode, language)
                
            } catch (e: Exception) {
                Timber.e(e, "Error initializing player")
                _playerState.update { it.copy(isLoading = false, error = e.message ?: "Unknown error") }
            }
        }
    }
    
    private fun loadStream(episode: Episode, language: String, seekToMs: Long = 0) {
        viewModelScope.launch {
            try {
                val streamUrl = episode.streamUrls.firstOrNull()
                if (streamUrl == null) {
                    _playerState.update { it.copy(error = "No stream available") }
                    return@launch
                }
                
                Timber.d("Loading stream: $streamUrl")
                
                val mediaItem = MediaItem.Builder().setUri(streamUrl).build()
                exoPlayer.setMediaItem(mediaItem)
                exoPlayer.prepare()
                
                trackSelectorManager.applyLanguagePreference(language)
                
                if (seekToMs > 0) {
                    exoPlayer.seekTo(seekToMs)
                    Timber.d("Seeking to position: ${seekToMs}ms")
                }
                
                exoPlayer.play()
                
                currentProgressId = WatchProgress.createId(
                    animeId = _playerState.value.currentAnime?.id ?: "",
                    seasonId = _playerState.value.currentSeason?.id ?: "",
                    episodeId = episode.id
                )
                
            } catch (e: Exception) {
                Timber.e(e, "Error loading stream")
                _playerState.update { it.copy(error = "Failed to load video") }
            }
        }
    }
    
    fun changeLanguage(newLanguage: String) {
        viewModelScope.launch {
            val currentEpisode = _playerState.value.currentEpisode ?: return@launch
            val currentAnime = _playerState.value.currentAnime ?: return@launch
            val currentSeason = _playerState.value.currentSeason ?: return@launch
            
            Timber.d("Changing language to $newLanguage")
            
            val currentPosition = exoPlayer.currentPosition
            val season = currentSeason.id.removePrefix("season_").toInt()
            val episodesResult = catalogRepository.getEpisodesForSeason(currentAnime.slug, season, newLanguage)
            
            if (episodesResult.isFailure) {
                Timber.e("Failed to load episodes for language: $newLanguage")
                return@launch
            }
            
            val episodes = episodesResult.getOrNull()!!
            val newEpisode = episodes.find { it.episodeNumber == currentEpisode.episodeNumber }
            
            if (newEpisode == null) {
                Timber.e("Episode not found in $newLanguage")
                return@launch
            }
            
            _playerState.update {
                it.copy(
                    currentLanguage = newLanguage,
                    currentEpisode = newEpisode,
                    queueEpisodes = episodes,
                    showLanguageSelector = false
                )
            }
            
            settingsRepository.setPreferredLanguage(newLanguage)
            loadStream(newEpisode, newLanguage, seekToMs = currentPosition)
        }
    }
    
    fun togglePlayPause() {
        if (exoPlayer.isPlaying) exoPlayer.pause() else exoPlayer.play()
        showControls()
    }
    
    fun seekTo(positionMs: Long) {
        exoPlayer.seekTo(positionMs.coerceIn(0, exoPlayer.duration))
        showControls()
    }
    
    fun playNextEpisode() {
        val state = _playerState.value
        if (!state.hasNextEpisode) return
        
        val nextEpisode = state.queueEpisodes[state.currentEpisodeIndex + 1]
        _playerState.update {
            it.copy(currentEpisode = nextEpisode, currentEpisodeIndex = state.currentEpisodeIndex + 1)
        }
        loadStream(nextEpisode, state.currentLanguage)
    }
    
    fun playPreviousEpisode() {
        val state = _playerState.value
        if (!state.hasPreviousEpisode) return
        
        val prevEpisode = state.queueEpisodes[state.currentEpisodeIndex - 1]
        _playerState.update {
            it.copy(currentEpisode = prevEpisode, currentEpisodeIndex = state.currentEpisodeIndex - 1)
        }
        loadStream(prevEpisode, state.currentLanguage)
    }
    
    fun playEpisode(episode: Episode) {
        val state = _playerState.value
        val index = state.queueEpisodes.indexOf(episode)
        if (index == -1) return
        
        _playerState.update { it.copy(currentEpisode = episode, currentEpisodeIndex = index, showQueue = false) }
        loadStream(episode, state.currentLanguage)
    }
    
    fun showControls() {
        _playerState.update { it.copy(showControls = true) }
        scheduleControlsHide()
    }
    
    fun hideControls() {
        _playerState.update { it.copy(showControls = false) }
    }
    
    fun toggleQueuePanel() {
        _playerState.update { it.copy(showQueue = !it.showQueue) }
    }
    
    fun hideQueuePanel() {
        _playerState.update { it.copy(showQueue = false) }
    }
    
    fun toggleLanguageSelector() {
        _playerState.update { it.copy(showLanguageSelector = !it.showLanguageSelector) }
    }
    
    fun hideLanguageSelector() {
        _playerState.update { it.copy(showLanguageSelector = false) }
    }
    
    fun onBackPressed(onNavigateBack: () -> Unit) {
        when {
            _playerState.value.showQueue -> hideQueuePanel()
            _playerState.value.showLanguageSelector -> hideLanguageSelector()
            else -> {
                saveProgressBeforeExit()
                onNavigateBack()
            }
        }
    }
    
    private fun setupPlayerListener() {
        exoPlayer.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                _playerState.update { it.copy(isPlaying = isPlaying) }
                if (isPlaying) scheduleControlsHide()
            }
            
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED && _playerState.value.hasNextEpisode) {
                    viewModelScope.launch {
                        delay(2000)
                        playNextEpisode()
                    }
                }
            }
        })
    }
    
    private fun startProgressTracking() {
        progressSaveJob = viewModelScope.launch {
            while (true) {
                delay(1000)
                val currentPosition = exoPlayer.currentPosition
                val duration = exoPlayer.duration
                
                _playerState.update {
                    it.copy(
                        currentPosition = currentPosition,
                        duration = duration,
                        bufferedPercentage = exoPlayer.bufferedPercentage
                    )
                }
                
                if (currentPosition % 5000 < 1000 && currentProgressId != null) {
                    saveProgress(currentPosition, duration)
                }
            }
        }
    }
    
    private fun saveProgress(positionMs: Long, durationMs: Long) {
        viewModelScope.launch {
            try {
                val state = _playerState.value
                val progressId = currentProgressId ?: return@launch
                
                val progress = WatchProgress(
                    id = progressId,
                    animeId = state.currentAnime?.id ?: return@launch,
                    animeTitle = state.currentAnime?.title ?: "",
                    animePosterUrl = state.currentAnime?.posterUrl ?: "",
                    seasonId = state.currentSeason?.id ?: "",
                    episodeId = state.currentEpisode?.id ?: "",
                    episodeNumber = state.currentEpisode?.episodeNumber ?: 0,
                    episodeTitle = state.currentEpisode?.title ?: "",
                    positionMs = positionMs,
                    durationMs = durationMs,
                    language = state.currentLanguage,
                    lastWatchedAt = System.currentTimeMillis(),
                    isCompleted = positionMs >= (durationMs * 0.9f),
                    streamUrl = state.currentEpisode?.streamUrls?.firstOrNull() ?: ""
                )
                
                watchProgressRepository.saveProgress(progress)
                Timber.d("Progress saved: $positionMs / $durationMs")
                
            } catch (e: Exception) {
                Timber.e(e, "Error saving progress")
            }
        }
    }
    
    private fun saveProgressBeforeExit() {
        saveProgress(exoPlayer.currentPosition, exoPlayer.duration)
    }
    
    private fun scheduleControlsHide() {
        controlsHideJob?.cancel()
        controlsHideJob = viewModelScope.launch {
            delay(5000)
            hideControls()
        }
    }
    
    override fun onCleared() {
        super.onCleared()
        progressSaveJob?.cancel()
        controlsHideJob?.cancel()
        saveProgressBeforeExit()
    }
}

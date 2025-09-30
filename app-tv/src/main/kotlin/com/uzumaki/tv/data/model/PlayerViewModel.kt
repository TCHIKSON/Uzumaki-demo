import com.uzumaki.tv.data.model.Episode

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import com.uzumaki.tv.data.repository.PlayerRepository
import com.uzumaki.tv.data.repository.CatalogRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import timber.log.Timber
import com.uzumaki.tv.data.model.PlayerState
import javax.inject.Inject


@androidx.media3.common.util.UnstableApi
@HiltViewModel
class PlayerViewModel @Inject constructor(
    private val catalogRepository: CatalogRepository,
    private val playerRepository: PlayerRepository,
    @ApplicationContext private val context: Context
) : ViewModel() {

    val exoPlayer: ExoPlayer = ExoPlayer.Builder(context).build()

    private val _playerState = MutableStateFlow(PlayerState(isLoading = true))
    val playerState: StateFlow<PlayerState> = _playerState.asStateFlow()

    fun initializePlayer(slug: String, seasonRaw: String, episodeId: String, language: String) {
        viewModelScope.launch {
            _playerState.update { it.copy(isLoading = true, error = null) }
            try {
                val seasonNumber = seasonRaw.filter { it.isDigit() }.toIntOrNull()
                    ?: seasonRaw.toIntOrNull() ?: 1

                val episodesRes = catalogRepository.getEpisodesForSeason(slug, seasonNumber, language)
                val queue = episodesRes.getOrThrow()
                val index = queue.indexOfFirst { it.id == episodeId }.let { if (it >= 0) it else 0 }
                playEpisodeInternal(queue, index, language)
            } catch (e: Exception) {
                Timber.e(e, "initializePlayer failed")
                _playerState.update { it.copy(isLoading = false, error = e.message ?: "Erreur") }
            }
        }
    }

    private suspend fun playEpisodeInternal(queue: List<Episode>, index: Int, language: String) {
        val ep = queue.getOrNull(index) ?: run {
            _playerState.update { it.copy(isLoading = false, error = "Épisode introuvable") }
            return
        }

        _playerState.update {
            it.copy(
                queueEpisodes = queue,
                currentEpisodeIndex = index,
                currentEpisode = ep,
                isLoading = true,
                currentLanguage = language
            )
        }

        val bestUrl = playerRepository.resolveBestUrl(ep.streamUrls)
        if (bestUrl.isNullOrBlank()) {
            _playerState.update { it.copy(isLoading = false, error = "Aucune source lisible pour ${ep.title}") }
            return
        }

        val mediaItem = MediaItem.fromUri(bestUrl)
        val factory = DefaultHttpDataSource.Factory()
        val mediaSource = if (playerRepository.isHls(bestUrl)) {
            HlsMediaSource.Factory(factory).createMediaSource(mediaItem)
        } else {
            ProgressiveMediaSource.Factory(factory).createMediaSource(mediaItem)
        }

        exoPlayer.setMediaSource(mediaSource)
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true

        _playerState.update { it.copy(isLoading = false, isPlaying = true) }
    }

    fun togglePlayPause() {
        if (exoPlayer.isPlaying) exoPlayer.pause() else exoPlayer.play()
        _playerState.update { it.copy(isPlaying = exoPlayer.isPlaying) }
    }

    override fun onCleared() {
        exoPlayer.release()
        super.onCleared()
    }
}

data class PlayerState(
    val isLoading: Boolean = false,
    val isPlaying: Boolean = false,
    val error: String? = null,
    val queueEpisodes: List<Episode> = emptyList(),
    val currentEpisodeIndex: Int = 0,
    val currentEpisode: Episode? = null,
    val currentLanguage: String? = null
)



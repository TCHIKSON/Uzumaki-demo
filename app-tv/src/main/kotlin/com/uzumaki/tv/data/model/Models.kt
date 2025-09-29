package com.uzumaki.tv.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName

// API Models
data class Anime(
    @SerializedName("_id") val id: AnimeId,
    val slug: String,
    val title: String,
    val genres: List<String>,
    val image: String,
    val languages: List<String>,
    val seasons: List<Season>,
    val type: String,
    val url: String,
    val updatedAt: Long
) {
    data class AnimeId(@SerializedName("\$oid") val oid: String)
}

data class Season(
    val name: String,
    val seasonHref: String
)

data class EpisodeData(
    @SerializedName("_id") val id: EpisodeId,
    val season: Int,
    val lang: String,
    val slug: String,
    val episodes: List<String>,
    val meta: Map<String, Map<String, List<String>>>,
    val pageUrl: String,
    val title: String
) {
    data class EpisodeId(@SerializedName("\$oid") val oid: String)
    
    fun getStreamUrls(episodeNumber: Int, language: String): List<String> {
        val langMeta = meta[language] ?: return emptyList()
        val episodeKey = "episode_$episodeNumber"
        return langMeta[episodeKey] ?: emptyList()
    }
}

// UI Models
data class Episode(
    val id: String,
    val animeId: String,
    val seasonId: String,
    val episodeNumber: Int,
    val title: String,
    val streamUrls: List<String>,
    val language: String
)

data class AnimeDetails(
    val id: String,
    val slug: String,
    val title: String,
    val posterUrl: String,
    val genres: List<String>,
    val availableLanguages: List<String>,
    val seasons: List<SeasonDetails>,
    val type: String
)

data class SeasonDetails(
    val id: String,
    val name: String,
    val episodes: List<Episode>
)

// Room Entities
@Entity(tableName = "watch_progress")
data class WatchProgress(
    @PrimaryKey val id: String,
    val animeId: String,
    val animeTitle: String,
    val animePosterUrl: String,
    val seasonId: String,
    val episodeId: String,
    val episodeNumber: Int,
    val episodeTitle: String,
    val positionMs: Long,
    val durationMs: Long,
    val language: String,
    val lastWatchedAt: Long,
    val isCompleted: Boolean = false,
    val streamUrl: String
) {
    companion object {
        fun createId(animeId: String, seasonId: String, episodeId: String) =
            "${animeId}_${seasonId}_${episodeId}"
    }
    
    fun getProgressPercentage(): Float {
        if (durationMs <= 0) return 0f
        return (positionMs.toFloat() / durationMs).coerceIn(0f, 1f)
    }
}

@Entity(tableName = "user_preferences")
data class UserPreferences(
    @PrimaryKey val id: Int = 1,
    val preferredLanguage: String = "VOSTFR",
    val autoPlayNextEpisode: Boolean = true
)

// Player State
data class PlayerState(
    val isPlaying: Boolean = false,
    val currentPosition: Long = 0L,
    val duration: Long = 0L,
    val bufferedPercentage: Int = 0,
    val currentAnime: AnimeDetails? = null,
    val currentSeason: SeasonDetails? = null,
    val currentEpisode: Episode? = null,
    val currentLanguage: String = "VOSTFR",
    val availableLanguages: List<String> = emptyList(),
    val queueEpisodes: List<Episode> = emptyList(),
    val currentEpisodeIndex: Int = 0,
    val showControls: Boolean = true,
    val showQueue: Boolean = false,
    val showLanguageSelector: Boolean = false,
    val isLoading: Boolean = false,
    val error: String? = null
) {
    val hasNextEpisode get() = currentEpisodeIndex < queueEpisodes.size - 1
    val hasPreviousEpisode get() = currentEpisodeIndex > 0
    val queueSize get() = queueEpisodes.size
    val animeTitle get() = currentAnime?.title ?: ""
    val episodeTitle get() = currentEpisode?.title ?: ""
}

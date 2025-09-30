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
    val id: String,   // ← le backend renvoie "id": "string"
    val season: String,
    val lang: String,
    val title: String,
    val episodes: List<EpisodeItem>,
    val meta: Map<String, Map<String, List<String>>> = emptyMap(),
    val updatedAt: Long? = null
) {
    // Accès pratique aux URLs de stream (via meta), avec fallback sur sources
    fun getStreamUrls(episodeNumber: Int, language: String): List<String> {
        val langKey = language.lowercase()
        // 1) priorité: meta[lang]["episode_N"]
        meta[langKey]?.get("episode_$episodeNumber")?.let { return it }
        // 2) fallback: trouver l'épisode et prendre ses sources.url
        val item = episodes.firstOrNull { it.number == episodeNumber } ?: return emptyList()
        return item.sources.mapNotNull { it.url }
    }
}

data class EpisodeItem(
    val showTitle: String,
    val season: String,
    val number: Int,
    val title: String,
    val sources: List<EpisodeSource> = emptyList(),
    val subtitles: List<EpisodeSubtitle> = emptyList()
)

data class EpisodeSource(
    val type: String,
    val url: String?
)

data class EpisodeSubtitle(
    val lang: String? = null,
    val url: String? = null
)

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
data class ResolveRequest(val urls: List<String>, val perLinkTimeoutMs: Int = 8000)
data class ResolveItem(
    val url: String,
    val success: Boolean,
    val directUrl: String? = null,
    val type: String? = null,
    val contentType: String? = null,
    val hostType: String? = null,
    val error: String? = null
)
data class ResolveResponse(val results: List<ResolveItem> = emptyList())



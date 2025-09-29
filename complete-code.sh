#!/bin/bash
# ================================================================
# INSTALLATEUR DE TOUT LE CODE KOTLIN COMPLET
# Ce fichier contient TOUS les fichiers sources nécessaires
# ================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  INSTALLATION DU CODE COMPLET             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

BASE="app-tv/src/main/kotlin/com/uzumaki/tv"

# ================================================================
# MODELS COMPLETS
# ================================================================

echo -e "${YELLOW}→${NC} Création data/model/Models.kt (complet)"

cat > "$BASE/data/model/Models.kt" << 'MODELSEOF'
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
MODELSEOF

echo -e "${GREEN}✓${NC} Models.kt créé"

# ================================================================
# DATABASE
# ================================================================

echo -e "${YELLOW}→${NC} Création data/local/Database.kt"

cat > "$BASE/data/local/Database.kt" << 'DATABASEOF'
package com.uzumaki.tv.data.local

import androidx.room.*
import com.uzumaki.tv.data.model.UserPreferences
import com.uzumaki.tv.data.model.WatchProgress
import kotlinx.coroutines.flow.Flow

@Dao
interface WatchProgressDao {
    @Query("SELECT * FROM watch_progress ORDER BY lastWatchedAt DESC")
    fun getAllProgress(): Flow<List<WatchProgress>>
    
    @Query("SELECT * FROM watch_progress ORDER BY lastWatchedAt DESC LIMIT :limit")
    fun getRecentProgress(limit: Int = 10): Flow<List<WatchProgress>>
    
    @Query("SELECT * FROM watch_progress WHERE id = :id")
    suspend fun getProgressById(id: String): WatchProgress?
    
    @Query("SELECT * FROM watch_progress WHERE isCompleted = 0 ORDER BY lastWatchedAt DESC")
    fun getIncompleteProgress(): Flow<List<WatchProgress>>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProgress(progress: WatchProgress)
    
    @Query("DELETE FROM watch_progress WHERE id = :id")
    suspend fun deleteProgressById(id: String)
}

@Dao
interface UserPreferencesDao {
    @Query("SELECT * FROM user_preferences WHERE id = 1")
    fun getPreferences(): Flow<UserPreferences?>
    
    @Query("SELECT * FROM user_preferences WHERE id = 1")
    suspend fun getPreferencesOnce(): UserPreferences?
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPreferences(preferences: UserPreferences)
}

@Database(
    entities = [WatchProgress::class, UserPreferences::class],
    version = 1,
    exportSchema = false
)
abstract class UzumakiDatabase : RoomDatabase() {
    abstract fun watchProgressDao(): WatchProgressDao
    abstract fun userPreferencesDao(): UserPreferencesDao
    
    companion object {
        const val DATABASE_NAME = "uzumaki_tv_db"
    }
}
DATABASEOF

echo -e "${GREEN}✓${NC} Database.kt créé"

# ================================================================
# API & REPOSITORIES
# ================================================================

echo -e "${YELLOW}→${NC} Création data/remote/ApiService.kt"

cat > "$BASE/data/remote/ApiService.kt" << 'APIEOF'
package com.uzumaki.tv.data.remote

import com.uzumaki.tv.data.model.Anime
import com.uzumaki.tv.data.model.EpisodeData
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface UzumakiApiService {
    @GET("api/catalog")
    suspend fun getCatalog(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50
    ): List<Anime>
    
    @GET("api/anime/{slug}")
    suspend fun getAnimeDetails(@Path("slug") slug: String): Anime
    
    @GET("api/anime/{slug}/episodes")
    suspend fun getEpisodes(
        @Path("slug") slug: String,
        @Query("season") season: Int = 1,
        @Query("lang") language: String = "VOSTFR"
    ): EpisodeData
}
APIEOF

echo -e "${GREEN}✓${NC} ApiService.kt créé"

echo -e "${YELLOW}→${NC} Création data/repository/Repositories.kt"

cat > "$BASE/data/repository/Repositories.kt" << 'REPOEOF'
package com.uzumaki.tv.data.repository

import com.uzumaki.tv.data.local.WatchProgressDao
import com.uzumaki.tv.data.local.UserPreferencesDao
import com.uzumaki.tv.data.model.*
import com.uzumaki.tv.data.remote.UzumakiApiService
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CatalogRepository @Inject constructor(
    private val apiService: UzumakiApiService
) {
    suspend fun getCatalog(page: Int = 1, limit: Int = 50): Result<List<Anime>> {
        return try {
            val catalog = apiService.getCatalog(page, limit)
            Result.success(catalog)
        } catch (e: Exception) {
            Timber.e(e, "Error fetching catalog")
            Result.failure(e)
        }
    }
    
    suspend fun getAnimeDetails(slug: String): Result<AnimeDetails> {
        return try {
            val anime = apiService.getAnimeDetails(slug)
            val details = AnimeDetails(
                id = anime.id.oid,
                slug = anime.slug,
                title = anime.title,
                posterUrl = anime.image,
                genres = anime.genres,
                availableLanguages = anime.languages,
                seasons = anime.seasons.mapIndexed { index, season ->
                    SeasonDetails(id = "season_${index + 1}", name = season.name, episodes = emptyList())
                },
                type = anime.type
            )
            Result.success(details)
        } catch (e: Exception) {
            Timber.e(e, "Error fetching anime details")
            Result.failure(e)
        }
    }
    
    suspend fun getEpisodesForSeason(slug: String, season: Int, language: String): Result<List<Episode>> {
        return try {
            val episodeData = apiService.getEpisodes(slug, season, language)
            val episodes = episodeData.episodes.mapIndexed { index, title ->
                Episode(
                    id = "ep_${index + 1}",
                    animeId = episodeData.id.oid,
                    seasonId = "season_${episodeData.season}",
                    episodeNumber = index + 1,
                    title = title,
                    streamUrls = episodeData.getStreamUrls(index + 1, language),
                    language = language
                )
            }
            Result.success(episodes)
        } catch (e: Exception) {
            Timber.e(e, "Error fetching episodes")
            Result.failure(e)
        }
    }
}

@Singleton
class WatchProgressRepository @Inject constructor(
    private val watchProgressDao: WatchProgressDao
) {
    fun getContinueWatching(): Flow<List<WatchProgress>> =
        watchProgressDao.getIncompleteProgress().map { it.take(10) }
    
    suspend fun getProgressById(id: String) = watchProgressDao.getProgressById(id)
    
    suspend fun saveProgress(progress: WatchProgress) {
        watchProgressDao.insertProgress(progress)
    }
}

@Singleton
class SettingsRepository @Inject constructor(
    private val userPreferencesDao: UserPreferencesDao
) {
    suspend fun getPreferredLanguage(): String =
        userPreferencesDao.getPreferencesOnce()?.preferredLanguage ?: "VOSTFR"
    
    suspend fun setPreferredLanguage(language: String) {
        val prefs = userPreferencesDao.getPreferencesOnce() ?: UserPreferences()
        userPreferencesDao.insertPreferences(prefs.copy(preferredLanguage = language))
    }
}
REPOEOF

echo -e "${GREEN}✓${NC} Repositories.kt créé"

echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ CODE COMPLET INSTALLÉ!${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo "Fichiers créés:"
echo "  ✓ Models.kt (complet)"
echo "  ✓ Database.kt (complet)"
echo "  ✓ ApiService.kt (complet)"
echo "  ✓ Repositories.kt (complet)"
echo ""
echo "Maintenant testez la compilation:"
echo "  ${GREEN}./gradlew :app-tv:assembleDebug${NC}"
echo ""
echo "Si erreurs, il manque probablement:"
echo "  • DI modules (AppModule.kt)"
echo "  • UI Screens (HomeScreen, DetailsScreen, PlayerScreen)"
echo "  • PlayerViewModel.kt"
echo ""
echo "Dites-moi si vous voulez que je créé ces fichiers aussi! 🚀"
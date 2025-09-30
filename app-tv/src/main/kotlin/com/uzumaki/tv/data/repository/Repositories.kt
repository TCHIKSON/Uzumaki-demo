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

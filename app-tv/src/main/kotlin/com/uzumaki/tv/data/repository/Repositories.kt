package com.uzumaki.tv.data.repository

import com.uzumaki.tv.data.local.UserPreferencesDao
import com.uzumaki.tv.data.local.WatchProgressDao
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

    // --- Public API ---

    suspend fun getCatalog(page: Int = 1, limit: Int = 50): Result<List<Anime>> = runCatching {
        val safePage = if (page < 1) 1 else page
        val offset = (safePage - 1) * limit
        apiService.getCatalog(limit = limit, offset = offset, q = null)
    }.onFailure { Timber.e(it, "Error fetching catalog") }

    /**
     * Construit AnimeDetails en combinant :
     * - meta (image/genres/saisons/langues) depuis le catalogue (filtré par slug),
     * - EpisodeData de la saison 1 pour découvrir les langues réellement dispo.
     */
    suspend fun getAnimeDetails(slug: String): Result<AnimeDetails> = runCatching {
        val catalog = apiService.getCatalog(limit = 500, offset = 0)
        val meta = catalog.firstOrNull { it.slug == slug }
            ?: catalog.firstOrNull { it.title.equals(slug, ignoreCase = true) || it.id.oid == slug }
            ?: error("Anime not found in catalog for slug=$slug")

        val discoveredLangs: List<String> = runCatching {
            val probeLang = (meta.languages.firstOrNull() ?: "vostfr").lowercase()
            val epData = apiService.getEpisodes(slug = meta.slug, season = 1, language = probeLang)
            epData.meta.keys.toList()
        }.getOrElse { emptyList() }

        val availableLanguages = (discoveredLangs.ifEmpty { meta.languages }).distinct()

        AnimeDetails(
            id = meta.slug,
            slug = meta.slug,
            title = meta.title,
            posterUrl = meta.image,
            genres = meta.genres,
            availableLanguages = availableLanguages,
            seasons = meta.seasons.mapIndexed { index, season ->
                SeasonDetails(
                    id = "${meta.slug}_season_${index + 1}",
                    name = season.name,
                    episodes = emptyList()
                )
            },
            type = meta.type
        )
    }.onFailure {
        Timber.e(it, "Error fetching anime details for slug=%s", slug)
    }



    /**
     * Épisodes d’une saison/langue à partir de EpisodeData.
     */
    suspend fun getEpisodesForSeason(
        slug: String,
        season: Int,
        language: String
    ): Result<List<Episode>> = runCatching {
        val lang = language.lowercase()
        val data = apiService.getEpisodes(slug = slug, season = season, language = lang)

        data.episodes.map { item ->
            Episode(
                id = "ep_${item.number}",
                animeId = slug,                          // ← String (plus de .oid)
                seasonId = "season_${data.season}",         // ← season est String
                episodeNumber = item.number,
                title = item.title,
                // 1) meta[lang]["episode_N"] si présent, sinon 2) sources.url de l'item
                streamUrls = data.meta[lang]?.get("episode_${item.number}")
                    ?: item.sources.mapNotNull { it.url },
                language = lang
            )
        }
    }.onFailure {
        Timber.e(it, "Error fetching episodes slug=%s season=%d lang=%s", slug, season, language)
    }


    // --- Private helpers ---

    private suspend fun fetchAnimeMeta(slug: String): Anime? {
        // Si ton backend supporte la pagination, tu peux élargir 'limit' pour être sûr de trouver le titre.
        // Sinon, implémente un cache côté app.
        return apiService.getCatalog(limit = 500, offset = 0)
            .firstOrNull { it.slug == slug }
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

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

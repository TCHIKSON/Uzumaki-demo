package com.uzumaki.tv.data.remote

import com.uzumaki.tv.data.model.ResolveRequest
import com.uzumaki.tv.data.model.ResolveResponse
import com.uzumaki.tv.data.model.Anime
import com.uzumaki.tv.data.model.EpisodeData
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Body
import retrofit2.http.POST

interface UzumakiApiService {
    @GET("api/animes")
    suspend fun getCatalog(
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0,
        @Query("q") q: String? = null
    ): List<Anime>

    // Correction : utiliser la route avec season et lang
    @GET("api/anime/{slug}/{season}/{lang}")
    suspend fun getAnimeDetails(
        @Path("slug") slug: String,
        @Path("season") season: Int ,
        @Path("lang") language: String
    ): EpisodeData  // Retourne directement EpisodeData

    @GET("api/anime/{slug}/{season}/{lang}")
    suspend fun getEpisodes(
        @Path("slug") slug: String,
        @Path("season") season: Int,
        @Path("lang") language: String
    ): EpisodeData



    @POST("api/resolver/resolve")
    suspend fun resolve(@Body body: ResolveRequest): ResolveResponse
}

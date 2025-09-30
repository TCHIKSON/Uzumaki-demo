package com.uzumaki.tv.data.repository


import com.uzumaki.tv.data.model.*
import com.uzumaki.tv.data.remote.UzumakiApiService

import javax.inject.Inject



class PlayerRepository @Inject constructor(
    private val api: UzumakiApiService
) {
    suspend fun resolveBestUrl(urls: List<String>): String? {
        if (urls.isEmpty()) return null
        // Direct si déjà mp4/m3u8
        urls.firstOrNull { it.endsWith(".m3u8", true) || it.endsWith(".mp4", true) }?.let { return it }
        // Sinon passer par le resolver
        return runCatching {
            val resp = api.resolve(ResolveRequest(urls = urls))
            val ok = resp.results.firstOrNull { it.success && !it.directUrl.isNullOrBlank() }
            ok?.directUrl
        }.getOrNull()
    }

    fun isHls(url: String) = url.contains(".m3u8", ignoreCase = true)
}

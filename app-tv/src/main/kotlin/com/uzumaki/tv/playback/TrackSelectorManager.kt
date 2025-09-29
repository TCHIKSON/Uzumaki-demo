package com.uzumaki.tv.playback

import androidx.media3.common.C
import androidx.media3.exoplayer.ExoPlayer
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TrackSelectorManager @Inject constructor(
    private val exoPlayer: ExoPlayer
) {
    fun applyLanguagePreference(language: String) {
        Timber.d("Applying language preference: $language")
        
        val params = exoPlayer.trackSelectionParameters.buildUpon().apply {
            when (language) {
                "VF" -> {
                    setPreferredAudioLanguage("fra")
                    setPreferredAudioLanguages("fra", "fr", "fre")
                    setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                    setPreferredTextLanguage(null)
                    Timber.d("VF mode: French audio, subtitles disabled")
                }
                "VOSTFR" -> {
                    setPreferredAudioLanguage("jpn")
                    setPreferredAudioLanguages("jpn", "ja", "jap")
                    setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                    setPreferredTextLanguage("fra")
                    setPreferredTextLanguages("fra", "fr", "fre")
                    setPreferredTextRoleFlags(C.ROLE_FLAG_SUBTITLE)
                    Timber.d("VOSTFR mode: Japanese audio, French subtitles")
                }
            }
        }.build()
        
        exoPlayer.trackSelectionParameters = params
    }
}

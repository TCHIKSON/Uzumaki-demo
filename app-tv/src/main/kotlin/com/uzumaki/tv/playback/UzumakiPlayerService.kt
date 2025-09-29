package com.uzumaki.tv.playback

import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import dagger.hilt.android.AndroidEntryPoint
import timber.log.Timber
import javax.inject.Inject

@AndroidEntryPoint
class UzumakiPlayerService : MediaSessionService() {
    
    @Inject
    lateinit var exoPlayer: ExoPlayer
    
    private var mediaSession: MediaSession? = null
    
    override fun onCreate() {
        super.onCreate()
        Timber.d("UzumakiPlayerService created")
        mediaSession = MediaSession.Builder(this, exoPlayer).build()
    }
    
    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? {
        return mediaSession
    }
    
    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        super.onDestroy()
    }
}

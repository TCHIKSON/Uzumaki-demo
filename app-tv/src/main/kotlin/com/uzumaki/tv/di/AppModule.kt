package com.uzumaki.tv.di

import android.content.Context
import androidx.media3.exoplayer.ExoPlayer
import androidx.room.Room
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.uzumaki.tv.data.local.UzumakiDatabase
import com.uzumaki.tv.data.remote.UzumakiApiService
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    
    @Provides
    @Singleton
    fun provideGson(): Gson = GsonBuilder().setLenient().create()
    
    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply { 
            level = HttpLoggingInterceptor.Level.BODY 
        }
        return OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }
    
    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient, gson: Gson): Retrofit {
        return Retrofit.Builder()
            .baseUrl("https://uzumaki.fly.dev")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }
    
    @Provides
    @Singleton
    fun provideApiService(retrofit: Retrofit): UzumakiApiService =
        retrofit.create(UzumakiApiService::class.java)
    
    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): UzumakiDatabase {
        return Room.databaseBuilder(
            context,
            UzumakiDatabase::class.java,
            UzumakiDatabase.DATABASE_NAME
        ).fallbackToDestructiveMigration().build()
    }
    
    @Provides
    @Singleton
    fun provideWatchProgressDao(db: UzumakiDatabase) = db.watchProgressDao()
    
    @Provides
    @Singleton
    fun provideUserPreferencesDao(db: UzumakiDatabase) = db.userPreferencesDao()
    
    @Provides
    @Singleton
    fun provideExoPlayer(@ApplicationContext context: Context): ExoPlayer {
        return ExoPlayer.Builder(context)
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build()
    }
}

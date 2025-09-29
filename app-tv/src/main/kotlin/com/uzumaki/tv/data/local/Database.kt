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

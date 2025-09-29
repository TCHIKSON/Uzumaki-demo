#!/bin/bash
# ============================================================
# UZUMAKI TV MODULE - INSTALLATEUR COMPLET
# Ce script crée TOUS les fichiers du module Android TV
# ============================================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  UZUMAKI TV MODULE - INSTALLATION         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
echo ""

# Vérification
if [ ! -f "settings.gradle.kts" ]; then
    echo -e "${RED}❌ Erreur: Vous devez être à la racine du projet${NC}"
    exit 1
fi

echo -e "${YELLOW}📁 Création de la structure de dossiers...${NC}"

# Créer TOUS les dossiers
mkdir -p app-tv/src/main/kotlin/com/uzumaki/tv/ui/{home,details,player,theme,components}
mkdir -p app-tv/src/main/kotlin/com/uzumaki/tv/data/{model,local,remote,repository}
mkdir -p app-tv/src/main/kotlin/com/uzumaki/tv/{playback,di,navigation}
mkdir -p app-tv/src/main/res/{values,drawable,drawable-xhdpi,mipmap-xxxhdpi}
mkdir -p app-tv/src/{test,androidTest}/kotlin/com/uzumaki/tv
mkdir -p docs .github/workflows

echo -e "${GREEN}✓${NC} Structure créée"
echo ""

# ============================================================
# CONFIGURATION ROOT
# ============================================================

echo -e "${YELLOW}⚙️  Configuration root...${NC}"

# Update settings.gradle.kts
if ! grep -q 'include(":app-tv")' settings.gradle.kts 2>/dev/null; then
    echo "" >> settings.gradle.kts
    echo "// Android TV Module" >> settings.gradle.kts
    echo 'include(":app-tv")' >> settings.gradle.kts
    echo -e "${GREEN}✓${NC} settings.gradle.kts mis à jour"
fi

# Create/update root build.gradle.kts
if [ ! -f "build.gradle.kts" ] || ! grep -q "com.android.application" build.gradle.kts 2>/dev/null; then
cat > build.gradle.kts << 'EOF'
plugins {
    id("com.android.application") version "8.2.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.22" apply false
    id("com.google.devtools.ksp") version "1.9.22-1.0.17" apply false
    id("com.google.dagger.hilt.android") version "2.50" apply false
}

tasks.register("clean", Delete::class) {
    delete(rootProject.buildDir)
}
EOF
    echo -e "${GREEN}✓${NC} build.gradle.kts (root) créé"
fi

echo ""

# ============================================================
# FICHIERS DE BUILD APP-TV
# ============================================================

echo -e "${YELLOW}🔧 Création des fichiers de build...${NC}"

# build.gradle.kts
cat > app-tv/build.gradle.kts << 'EOF'
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")
    id("com.google.dagger.hilt.android")
}

android {
    namespace = "com.uzumaki.tv"
    compileSdk = 34
    
    defaultConfig {
        applicationId = "com.uzumaki.tv"
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables { useSupportLibrary = true }
    }
    
    buildFeatures {
        compose = true
        buildConfig = true
    }
    
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }
    
    buildTypes {
        debug {
            isDebuggable = true
            applicationIdSuffix = ".debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    
    kotlinOptions {
        jvmTarget = "17"
        freeCompilerArgs += listOf(
            "-opt-in=androidx.compose.material3.ExperimentalMaterial3Api",
            "-opt-in=androidx.tv.material3.ExperimentalTvMaterial3Api"
        )
    }
    
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.02.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    
    implementation("androidx.tv:tv-foundation:1.0.0-alpha10")
    implementation("androidx.tv:tv-material:1.0.0-alpha10")
    
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")
    
    implementation("androidx.navigation:navigation-compose:2.7.7")
    
    val media3Version = "1.2.1"
    implementation("androidx.media3:media3-exoplayer:$media3Version")
    implementation("androidx.media3:media3-ui:$media3Version")
    implementation("androidx.media3:media3-session:$media3Version")
    implementation("androidx.media3:media3-exoplayer-dash:$media3Version")
    implementation("androidx.media3:media3-exoplayer-hls:$media3Version")
    implementation("androidx.media3:media3-common:$media3Version")
    
    val roomVersion = "2.6.1"
    implementation("androidx.room:room-runtime:$roomVersion")
    implementation("androidx.room:room-ktx:$roomVersion")
    ksp("androidx.room:room-compiler:$roomVersion")
    
    implementation("androidx.datastore:datastore-preferences:1.0.0")
    
    implementation("com.squareup.retrofit2:retrofit:2.9.0")
    implementation("com.squareup.retrofit2:converter-gson:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    
    implementation("io.coil-kt:coil-compose:2.5.0")
    
    val hiltVersion = "2.50"
    implementation("com.google.dagger:hilt-android:$hiltVersion")
    ksp("com.google.dagger:hilt-compiler:$hiltVersion")
    implementation("androidx.hilt:hilt-navigation-compose:1.1.0")
    
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    
    implementation("com.google.code.gson:gson:2.10.1")
    implementation("com.jakewharton.timber:timber:5.0.1")
    implementation("androidx.leanback:leanback:1.2.0-alpha04")
    
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
EOF
echo -e "${GREEN}✓${NC} build.gradle.kts créé"

# proguard-rules.pro
cat > app-tv/proguard-rules.pro << 'EOF'
# Retrofit
-dontwarn retrofit2.**
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class retrofit2.** { *; }
-keepattributes Signature
-keepattributes Exceptions

# Gson
-keep class com.google.gson.** { *; }
-keep class com.uzumaki.tv.data.model.** { *; }
-keepclassmembers,allowobfuscation class * {
  @com.google.gson.annotations.SerializedName <fields>;
}

# Media3
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *

# Hilt
-keep class dagger.hilt.** { *; }
-keep class javax.inject.** { *; }

# Kotlin
-keep class kotlin.** { *; }
-keepclassmembers class kotlin.Metadata {
    public <methods>;
}

# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
}
-assumenosideeffects class timber.log.Timber {
    public static *** d(...);
    public static *** v(...);
}
EOF
echo -e "${GREEN}✓${NC} proguard-rules.pro créé"

echo ""

# ============================================================
# MANIFEST
# ============================================================

echo -e "${YELLOW}📱 Création AndroidManifest.xml...${NC}"

cat > app-tv/src/main/AndroidManifest.xml << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-feature
        android:name="android.software.leanback"
        android:required="true" />
    
    <uses-feature
        android:name="android.hardware.touchscreen"
        android:required="false" />
    
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />

    <application
        android:name=".TvApplication"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:theme="@style/Theme.Uzumaki.Leanback"
        android:hardwareAccelerated="true"
        android:largeHeap="true"
        android:usesCleartextTraffic="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="landscape"
            android:configChanges="keyboard|keyboardHidden|navigation"
            android:launchMode="singleTask">
            
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".playback.UzumakiPlayerService"
            android:exported="true"
            android:foregroundServiceType="mediaPlayback">
            <intent-filter>
                <action android:name="androidx.media3.session.MediaSessionService" />
            </intent-filter>
        </service>

    </application>

</manifest>
EOF
echo -e "${GREEN}✓${NC} AndroidManifest.xml créé"

echo ""

# ============================================================
# RESOURCES XML
# ============================================================

echo -e "${YELLOW}🎨 Création des resources...${NC}"

cat > app-tv/src/main/res/values/strings.xml << 'EOF'
<resources>
    <string name="app_name">Uzumaki TV</string>
    <string name="continue_watching">Reprendre la lecture</string>
    <string name="catalog">Catalogue</string>
    <string name="loading">Chargement…</string>
    <string name="error">Erreur</string>
    <string name="retry">Réessayer</string>
    <string name="play">Lecture</string>
    <string name="pause">Pause</string>
    <string name="language">Langue</string>
    <string name="season">Saison</string>
</resources>
EOF

cat > app-tv/src/main/res/values/colors.xml << 'EOF'
<resources>
    <color name="tv_primary">#FF6200EE</color>
    <color name="tv_secondary">#FF03DAC6</color>
    <color name="tv_background">#FF121212</color>
    <color name="tv_surface">#FF1E1E1E</color>
    <color name="focus_highlight">#4DFFFFFF</color>
    <color name="focus_border">#FFFFFFFF</color>
</resources>
EOF

cat > app-tv/src/main/res/values/dimens.xml << 'EOF'
<resources>
    <dimen name="overscan_margin_horizontal">48dp</dimen>
    <dimen name="overscan_margin_vertical">27dp</dimen>
    <dimen name="tv_card_width">280dp</dimen>
    <dimen name="tv_card_height">180dp</dimen>
    <dimen name="tv_focus_elevation">8dp</dimen>
</resources>
EOF

cat > app-tv/src/main/res/values/themes.xml << 'EOF'
<resources>
    <style name="Theme.Uzumaki.Leanback" parent="Theme.Leanback">
        <item name="android:colorPrimary">@color/tv_primary</item>
        <item name="android:colorPrimaryDark">@color/tv_background</item>
        <item name="android:colorAccent">@color/tv_secondary</item>
        <item name="android:windowBackground">@color/tv_background</item>
    </style>
</resources>
EOF

echo -e "${GREEN}✓${NC} Resources créées"

echo ""
echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ INSTALLATION TERMINÉE!${NC}"
echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}📝 IMPORTANT:${NC} Les fichiers Kotlin ne sont pas encore créés"
echo ""
echo "Prochaines étapes:"
echo "1. Exécutez: ${GREEN}./create-kotlin-files.sh${NC}"
echo "2. Testez: ${GREEN}./gradlew :app-tv:assembleDebug${NC}"
echo "3. Commit: ${GREEN}git add . && git commit -m 'feat(tv): complete module'${NC}"
echo "4. Push: ${GREEN}git push origin dev-plus${NC}"
echo ""
echo -e "${BLUE}🎉 Structure prête!${NC}"
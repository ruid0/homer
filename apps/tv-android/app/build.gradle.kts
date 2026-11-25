import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The address comes from local.properties, which git ignores, so the household's address is never committed.
val local = Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
val homerUrl = (local.getProperty("homer.url") ?: "").trim()

android {
    namespace = "app.homer.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.homer.tv"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "HOMER_URL", "\"${homerUrl.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}

// Tests do not need the address, but an app without one would open nothing, so building one stops here.
tasks.matching { it.name.startsWith("assemble") }.configureEach {
    doFirst {
        if (homerUrl.isBlank()) {
            throw GradleException("Set homer.url in apps/tv-android/local.properties (see local.properties.example).")
        }
    }
}

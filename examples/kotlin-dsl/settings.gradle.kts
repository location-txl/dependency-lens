pluginManagement {
    repositories {
        mavenLocal()
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositories {
        maven { url = uri("../android/repo") }
        google()
        mavenCentral()
    }
}
rootProject.name = "DependencyLensKotlinSample"
include(":app")

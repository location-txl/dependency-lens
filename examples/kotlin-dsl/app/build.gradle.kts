plugins { id("com.android.application") }

android {
    namespace = "dev.dependencylens.kotlinsample"
    compileSdk = 36
    defaultConfig {
        applicationId = "dev.dependencylens.kotlinsample"
        minSdk = 23
        targetSdk = 36
    }
}

dependencies {
    implementation("lens.fixture:first:1.0")
    implementation("lens.fixture:second:1.0")
    compileOnly("lens.fixture:compile-only:1.0")
    runtimeOnly("lens.fixture:runtime-only:1.0")
}

plugins {
    id("com.android.application") version "8.13.2" apply false
    id("dev.dependencylens") version "0.1.0"
}

dependencyLens {
    outputFile.set(layout.buildDirectory.file("reports/dependency-lens/custom.html"))
}

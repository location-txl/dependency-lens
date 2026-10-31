plugins {
    `java-gradle-plugin`
    `maven-publish`
}

group = "dev.dependencylens"
version = "0.1.0"

repositories {
    google()
    mavenCentral()
}

java {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
    withSourcesJar()
}

dependencies {
    compileOnly("com.android.tools.build:gradle-api:7.0.0")
    compileOnly(localGroovy())
    testImplementation(gradleTestKit())
    testImplementation("junit:junit:4.13.2")
}

gradlePlugin {
    plugins {
        create("dependencyLens") {
            id = "dev.dependencylens"
            implementationClass = "dev.dependencylens.DependencyLensPlugin"
            displayName = "Dependency Lens"
            description = "Offline Android dependency trees, resolution reasons and dependency paths."
        }
    }
}

// Optional standard Maven publication; no remote repository is contacted by default.
findProperty("publishRepositoryUrl")?.toString()?.let { targetUrl ->
    publishing.repositories.maven {
        name = "target"
        url = uri(targetUrl)
        credentials(PasswordCredentials::class)
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
    options.release.set(11)
}

tasks.test {
    maxHeapSize = "768m"
    systemProperty("lens.projectDir", projectDir.absolutePath)
    // Opt-in: functional tests can select another installed Gradle distribution.
    System.getProperty("lens.testGradleHome")?.let { systemProperty("lens.testGradleHome", it) }
}

val frontendTest by tasks.registering(Exec::class) {
    group = "verification"
    commandLine("node", "--test", "src/test/js/report.test.cjs")
}

tasks.check { dependsOn(frontendTest) }

tasks.register<Exec>("compatibilityTest") {
    group = "verification"
    description = "Run the pinned Android compatibility matrix; see scripts/compatibility.py --help."
    dependsOn(tasks.jar)
    commandLine("python3", "scripts/compatibility.py", "--matrix", "smoke")
}

tasks.wrapper {
    gradleVersion = "7.0.2"
    distributionType = Wrapper.DistributionType.BIN
    distributionUrl = "https://downloads.gradle.org/distributions/gradle-7.0.2-bin.zip"
    distributionSha256Sum = "0e46229820205440b48a5501122002842b82886e76af35f0f3a069243dca4b3c"
}

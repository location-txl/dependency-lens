package dev.dependencylens;

import org.gradle.api.file.RegularFileProperty;

/** Report destination. Scope is selected by the documented -P properties. */
public abstract class DependencyLensExtension {
    public abstract RegularFileProperty getOutputFile();
}

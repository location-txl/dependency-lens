package dev.dependencylens.report;

import static dev.dependencylens.analysis.Json.object;

import dev.dependencylens.analysis.Json;
import java.io.File;
import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.gradle.api.DefaultTask;
import org.gradle.api.GradleException;
import org.gradle.api.file.ConfigurableFileCollection;
import org.gradle.api.file.RegularFileProperty;
import org.gradle.api.provider.ListProperty;
import org.gradle.api.provider.Property;
import org.gradle.api.provider.SetProperty;
import org.gradle.api.tasks.Input;
import org.gradle.api.tasks.InputFiles;
import org.gradle.api.tasks.OutputFile;
import org.gradle.api.tasks.PathSensitive;
import org.gradle.api.tasks.PathSensitivity;
import org.gradle.api.tasks.TaskAction;

public abstract class GenerateReportTask extends DefaultTask {
    @Input public abstract Property<String> getProjectName();
    @Input public abstract ListProperty<String> getAvailableModules();
    @Input public abstract SetProperty<String> getRequestedModules();
    @Input public abstract SetProperty<String> getRequestedVariants();
    @InputFiles @PathSensitive(PathSensitivity.NONE) public abstract ConfigurableFileCollection getModuleReports();
    @OutputFile public abstract RegularFileProperty getOutputFile();

    public GenerateReportTask() {
        getAvailableModules().convention(Collections.emptyList());
        getRequestedModules().convention(Collections.emptySet());
        getRequestedVariants().convention(Collections.emptySet());
        getOutputs().upToDateWhen(task -> false);
    }

    @TaskAction
    @SuppressWarnings("unchecked")
    public void generate() throws IOException {
        if (getAvailableModules().get().isEmpty()) throw new GradleException("没有发现 Android 应用、库或 Dynamic Feature 模块。");
        Set<String> missingModules = new HashSet<>(getRequestedModules().get());
        missingModules.removeAll(getAvailableModules().get());
        if (!missingModules.isEmpty()) throw new GradleException("不存在的 Android 模块：" + missingModules);
        List<Map<String, Object>> modules = new ArrayList<>();
        Set<String> variants = new HashSet<>();
        for (File file : getModuleReports()) {
            Map<String, Object> module = Json.read(file);
            variants.addAll((List<String>) module.get("availableVariants"));
            if (!((List<?>) module.get("graphs")).isEmpty()) modules.add(module);
        }
        Set<String> missingVariants = new HashSet<>(getRequestedVariants().get());
        missingVariants.removeAll(variants);
        if (!missingVariants.isEmpty()) throw new GradleException("所选模块不存在已启用的构建变体：" + missingVariants);
        if (modules.isEmpty()) throw new GradleException("当前筛选范围没有已启用的生产构建变体。");
        modules.sort(Comparator.comparing(m -> m.get("path").toString()));
        Map<String, Object> report = object("schemaVersion", 1, "projectName", getProjectName().get(),
            "generatedAt", OffsetDateTime.now().toString(), "pluginVersion", "0.1.0",
            "gradleVersion", getProject().getGradle().getGradleVersion(), "modules", modules);
        File output = getOutputFile().get().getAsFile();
        Json.writeText(output, HtmlReport.render(report));
        getLogger().lifecycle("Dependency Lens 报告已生成：{}", output);
    }
}

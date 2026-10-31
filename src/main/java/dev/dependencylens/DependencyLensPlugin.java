package dev.dependencylens;

import dev.dependencylens.report.GenerateReportTask;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import org.gradle.api.GradleException;
import org.gradle.api.Plugin;
import org.gradle.api.Project;
import org.gradle.api.tasks.TaskProvider;
import org.gradle.util.GradleVersion;

public final class DependencyLensPlugin implements Plugin<Project> {
    @Override
    public void apply(Project root) {
        if (root != root.getRootProject()) {
            throw new GradleException("Dependency Lens 请只应用在根工程，报告会自动汇总 Android 子模块。");
        }
        if (GradleVersion.current().compareTo(GradleVersion.version("7.0.2")) < 0) {
            throw new GradleException("Dependency Lens 要求 Gradle 7.0.2 或更新版本。");
        }
        Set<String> modules = filter(root, "dependencyLens.modules", true);
        Set<String> variants = filter(root, "dependencyLens.variants", false);
        DependencyLensExtension extension = root.getExtensions().create("dependencyLens", DependencyLensExtension.class);
        extension.getOutputFile().convention(root.getLayout().getBuildDirectory().file("reports/dependency-lens/index.html"));
        TaskProvider<GenerateReportTask> report = root.getTasks().register("dependencyLensReport", GenerateReportTask.class, task -> {
            task.setGroup("reporting");
            task.setDescription("生成 Android 依赖树、版本选择原因与依赖路径的离线 HTML 报告。");
            task.getOutputFile().set(extension.getOutputFile());
            task.getProjectName().set(root.getName());
            task.getRequestedModules().set(modules);
            task.getRequestedVariants().set(variants);
        });
        root.allprojects(project -> {
            project.getPluginManager().withPlugin("com.android.application", p ->
                AndroidIntegration.register(project, "application", modules, variants, report));
            project.getPluginManager().withPlugin("com.android.library", p ->
                AndroidIntegration.register(project, "library", modules, variants, report));
            project.getPluginManager().withPlugin("com.android.dynamic-feature", p ->
                AndroidIntegration.register(project, "dynamic-feature", modules, variants, report));
        });
    }

    private static Set<String> filter(Project project, String key, boolean modulePaths) {
        Set<String> values = new LinkedHashSet<>();
        Object raw = project.findProperty(key);
        if (raw == null) return values;
        for (String part : Arrays.asList(raw.toString().split(",", -1))) {
            String value = part.trim();
            if (value.isEmpty() || (modulePaths && !value.startsWith(":"))) {
                throw new GradleException(key + " 格式无效：使用逗号分隔的精确名称，模块路径以 : 开头。");
            }
            values.add(value);
        }
        return values;
    }
}

package dev.dependencylens;

import com.android.build.api.variant.AndroidComponentsExtension;
import com.android.build.api.variant.Variant;
import dev.dependencylens.analysis.CollectDependenciesTask;
import dev.dependencylens.report.GenerateReportTask;
import java.util.Set;
import org.gradle.api.Action;
import org.gradle.api.Project;
import org.gradle.api.tasks.TaskProvider;

/** Only the AGP 7.0 public API is linked from this adapter. */
final class AndroidIntegration {
    private AndroidIntegration() {}

    @SuppressWarnings({"rawtypes", "unchecked"})
    static void register(Project project, String type, Set<String> modules, Set<String> variants,
                         TaskProvider<GenerateReportTask> report) {
        report.configure(task -> task.getAvailableModules().add(project.getPath()));
        if (!modules.isEmpty() && !modules.contains(project.getPath())) return;
        AndroidComponentsExtension components = project.getExtensions().getByType(AndroidComponentsExtension.class);
        TaskProvider<CollectDependenciesTask> collect = project.getTasks().register("collectDependencyLensData", CollectDependenciesTask.class, task -> {
            task.getModulePath().set(project.getPath());
            task.getModuleType().set(type);
            task.getAgpVersion().set(components.getPluginVersion().toString());
            task.getRequestedVariants().set(variants);
            task.getOutputFile().convention(project.getLayout().getBuildDirectory().file("dependency-lens/model.json"));
        });
        components.onVariants(components.selector().all(), (Action<Variant>) variant ->
            collect.configure(task -> task.getAvailableVariants().add(variant.getName())));
        report.configure(task -> task.getModuleReports().from(collect.flatMap(CollectDependenciesTask::getOutputFile)));
    }
}

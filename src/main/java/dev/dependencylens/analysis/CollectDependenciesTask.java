package dev.dependencylens.analysis;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.gradle.api.DefaultTask;
import org.gradle.api.artifacts.Configuration;
import org.gradle.api.file.RegularFileProperty;
import org.gradle.api.provider.ListProperty;
import org.gradle.api.provider.Property;
import org.gradle.api.provider.SetProperty;
import org.gradle.api.tasks.Input;
import org.gradle.api.tasks.OutputFile;
import org.gradle.api.tasks.TaskAction;

public abstract class CollectDependenciesTask extends DefaultTask {
    @Input public abstract Property<String> getModulePath();
    @Input public abstract Property<String> getModuleType();
    @Input public abstract Property<String> getAgpVersion();
    @Input public abstract ListProperty<String> getAvailableVariants();
    @Input public abstract SetProperty<String> getRequestedVariants();
    @OutputFile public abstract RegularFileProperty getOutputFile();

    public CollectDependenciesTask() {
        getAvailableVariants().convention(Collections.emptyList());
        getRequestedVariants().convention(Collections.emptySet());
        getOutputs().upToDateWhen(task -> false);
    }

    @TaskAction
    public void collect() throws IOException {
        List<Map<String, Object>> graphs = new ArrayList<>();
        Set<String> requested = getRequestedVariants().get();
        List<String> variants = new ArrayList<>(getAvailableVariants().get());
        Collections.sort(variants);
        for (String variant : variants) {
            if (!requested.isEmpty() && !requested.contains(variant)) continue;
            for (String scope : new String[]{"runtime", "compile"}) {
                String name = variant + (scope.equals("runtime") ? "RuntimeClasspath" : "CompileClasspath");
                Configuration configuration = getProject().getConfigurations().findByName(name);
                Map<String, Object> graph = new GraphCollector(getProject()).collect(configuration, name);
                graph.put("id", getModulePath().get() + "|" + name);
                graph.put("module", getModulePath().get());
                graph.put("variant", variant);
                graph.put("scope", scope);
                graphs.add(graph);
                if (!"complete".equals(graph.get("status"))) {
                    getLogger().warn("Dependency Lens: {} / {} 存在解析问题，详见报告。", getModulePath().get(), name);
                }
            }
        }
        Json.write(getOutputFile().get().getAsFile(), Json.object("path", getModulePath().get(),
            "type", getModuleType().get(), "agpVersion", getAgpVersion().get(), "availableVariants", variants, "graphs", graphs));
    }
}

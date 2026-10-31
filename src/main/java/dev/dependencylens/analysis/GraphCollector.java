package dev.dependencylens.analysis;

import static dev.dependencylens.analysis.Json.object;

import java.io.File;
import java.net.URI;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.gradle.api.Project;
import org.gradle.api.artifacts.Configuration;
import org.gradle.api.artifacts.Dependency;
import org.gradle.api.artifacts.FileCollectionDependency;
import org.gradle.api.artifacts.component.ComponentIdentifier;
import org.gradle.api.artifacts.component.ModuleComponentIdentifier;
import org.gradle.api.artifacts.component.ModuleComponentSelector;
import org.gradle.api.artifacts.component.ProjectComponentIdentifier;
import org.gradle.api.artifacts.component.ProjectComponentSelector;
import org.gradle.api.artifacts.result.ComponentSelectionDescriptor;
import org.gradle.api.artifacts.result.DependencyResult;
import org.gradle.api.artifacts.result.ResolvedComponentResult;
import org.gradle.api.artifacts.result.ResolvedDependencyResult;
import org.gradle.api.artifacts.result.ResolvedVariantResult;
import org.gradle.api.artifacts.result.UnresolvedDependencyResult;
import org.gradle.api.attributes.Attribute;
import org.gradle.api.attributes.AttributeContainer;

/** Reads metadata only. It never requests an artifact view or resolves a file classpath. */
public final class GraphCollector {
    private final Project project;
    private final List<Map<String, Object>> nodes = new ArrayList<>();
    private final List<Map<String, Object>> edges = new ArrayList<>();
    private final List<Map<String, Object>> issues = new ArrayList<>();
    private final Map<ComponentIdentifier, String> componentIds = new HashMap<>();
    private final Map<ComponentIdentifier, Map<String, String>> variantNodes = new HashMap<>();
    private final Set<String> expanded = new HashSet<>();
    private final Deque<Pending> pending = new ArrayDeque<>();
    private final Map<String, String> unresolvedNodes = new HashMap<>();

    public GraphCollector(Project project) { this.project = project; }

    public Map<String, Object> collect(Configuration configuration, String configurationName) {
        nodes.add(object("id", "root", "componentId", "root", "kind", "root", "name", project.getPath(),
            "coordinate", project.getPath(), "resolved", true, "reasons", Collections.emptyList(),
            "attributes", Collections.emptyMap(), "version", null));
        String status = "complete";
        try {
            if (configuration == null || !configuration.isCanBeResolved()) {
                throw new IllegalStateException("配置不存在或不可解析：" + configurationName);
            }
            ResolvedComponentResult root = configuration.getIncoming().getResolutionResult().getRoot();
            addDependencies("root", root.getDependencies());
            while (!pending.isEmpty()) {
                Pending current = pending.removeFirst();
                if (!expanded.add(current.nodeId)) continue;
                addDependencies(current.nodeId, current.component.getDependenciesForVariant(current.variant));
            }
            addLocalFiles(configuration);
            if (!issues.isEmpty()) status = "partial";
        } catch (Exception failure) {
            status = "failed";
            issues.add(object("kind", "configuration", "message", safeError(failure)));
        }
        return object("configuration", configurationName, "rootId", "root", "status", status,
            "nodes", nodes, "edges", edges, "issues", issues);
    }

    private void addDependencies(String source, Iterable<? extends DependencyResult> dependencies) {
        List<DependencyResult> sorted = new ArrayList<>();
        dependencies.forEach(sorted::add);
        sorted.sort(Comparator.comparing(d -> d.getRequested().getDisplayName()));
        for (DependencyResult dependency : sorted) {
            Map<String, Object> request = request(dependency);
            String target;
            String changeKind = "none";
            boolean constraint = dependency.isConstraint();
            if (dependency instanceof ResolvedDependencyResult) {
                ResolvedDependencyResult resolved = (ResolvedDependencyResult) dependency;
                target = node(resolved.getSelected(), resolved.getResolvedVariant());
                changeKind = changeKind(dependency, resolved.getSelected().getId());
                // Constraints explain selection; they do not introduce the selected component's children.
                if (!constraint) pending.addLast(new Pending(resolved.getSelected(), resolved.getResolvedVariant(), target));
            } else if (dependency instanceof UnresolvedDependencyResult) {
                UnresolvedDependencyResult unresolved = (UnresolvedDependencyResult) dependency;
                String error = safeError(unresolved.getFailure());
                String key = dependency.getRequested().getDisplayName() + "\n" + error;
                target = unresolvedNodes.get(key);
                if (target == null) {
                    target = "n" + nodes.size();
                    unresolvedNodes.put(key, target);
                    nodes.add(object("id", target, "componentId", target, "kind", "unresolved", "name", request.get("name"),
                        "group", request.get("group"), "coordinate", request.get("display"), "version", null,
                        "resolved", false, "error", error, "reasons", Collections.emptyList(), "attributes", Collections.emptyMap()));
                }
                issues.add(object("kind", "dependency", "from", source, "target", target,
                    "requested", request.get("display"), "constraint", constraint, "message", error));
            } else {
                throw new IllegalStateException("未知依赖结果类型：" + dependency.getClass().getName());
            }
            edges.add(object("id", "e" + edges.size(), "from", source, "to", target, "requested", request,
                "constraint", constraint, "changeKind", constraint ? "constraint" : changeKind));
        }
    }

    private String node(ResolvedComponentResult component, ResolvedVariantResult variant) {
        ComponentIdentifier id = component.getId();
        Map<String, Object> attributes = attributes(variant.getAttributes());
        List<String> capabilities = new ArrayList<>();
        variant.getCapabilities().forEach(c -> capabilities.add(c.getGroup() + ":" + c.getName() + ":" + c.getVersion()));
        Collections.sort(capabilities);
        String variantKey = variant.getDisplayName() + Json.stringify(attributes) + capabilities;
        Map<String, String> variants = variantNodes.computeIfAbsent(id, ignored -> new LinkedHashMap<>());
        if (variants.containsKey(variantKey)) return variants.get(variantKey);
        String nodeId = "n" + nodes.size();
        variants.put(variantKey, nodeId);
        String componentId = componentIds.computeIfAbsent(id, ignored -> "c" + componentIds.size());
        List<Map<String, Object>> reasons = new ArrayList<>();
        for (ComponentSelectionDescriptor descriptor : component.getSelectionReason().getDescriptions()) {
            reasons.add(object("cause", descriptor.getCause().name(), "description", safeText(descriptor.getDescription())));
        }
        Map<String, Object> data = object("id", nodeId, "componentId", componentId, "kind", "component",
            "coordinate", id.getDisplayName(), "name", id.getDisplayName(), "group", "", "version", null,
            "resolved", true, "variant", variant.getDisplayName(), "attributes", attributes,
            "capabilities", capabilities, "reasons", reasons);
        if (id instanceof ModuleComponentIdentifier) {
            ModuleComponentIdentifier module = (ModuleComponentIdentifier) id;
            data.put("kind", "module");
            data.put("name", module.getModule());
            data.put("group", module.getGroup());
            data.put("version", module.getVersion());
            data.put("coordinate", module.getGroup() + ":" + module.getModule() + ":" + module.getVersion());
        } else if (id instanceof ProjectComponentIdentifier) {
            data.put("kind", "project");
            data.put("name", ((ProjectComponentIdentifier) id).getProjectPath());
        }
        Object category = attributes.get("org.gradle.category");
        if (category != null && category.toString().contains("platform")) data.put("kind", "platform");
        nodes.add(data);
        return nodeId;
    }

    private static Map<String, Object> request(DependencyResult dependency) {
        Map<String, Object> request = object("display", dependency.getRequested().getDisplayName(),
            "kind", "component", "name", dependency.getRequested().getDisplayName(), "group", "", "version", null);
        if (dependency.getRequested() instanceof ModuleComponentSelector) {
            ModuleComponentSelector selector = (ModuleComponentSelector) dependency.getRequested();
            request.put("kind", "module");
            request.put("name", selector.getModule());
            request.put("group", selector.getGroup());
            request.put("version", selector.getVersion());
            request.put("versionConstraint", object("required", selector.getVersionConstraint().getRequiredVersion(),
                "strict", selector.getVersionConstraint().getStrictVersion(), "preferred", selector.getVersionConstraint().getPreferredVersion(),
                "rejected", selector.getVersionConstraint().getRejectedVersions()));
        } else if (dependency.getRequested() instanceof ProjectComponentSelector) {
            request.put("kind", "project");
            request.put("name", ((ProjectComponentSelector) dependency.getRequested()).getProjectPath());
        }
        return request;
    }

    private static String changeKind(DependencyResult dependency, ComponentIdentifier selected) {
        if (dependency.getRequested() instanceof ModuleComponentSelector) {
            ModuleComponentSelector requested = (ModuleComponentSelector) dependency.getRequested();
            if (!(selected instanceof ModuleComponentIdentifier)) return "substitution";
            ModuleComponentIdentifier module = (ModuleComponentIdentifier) selected;
            if (!requested.getGroup().equals(module.getGroup()) || !requested.getModule().equals(module.getModule())) return "substitution";
            String version = requested.getVersion();
            if (version == null || version.isEmpty()) return "managed";
            if (dynamicVersion(version)) return "dynamic";
            return version.equals(module.getVersion()) ? "none" : "version";
        }
        if (dependency.getRequested() instanceof ProjectComponentSelector
            && !dependency.getRequested().matchesStrictly(selected)) return "substitution";
        return "none";
    }

    public static boolean dynamicVersion(String version) {
        return version.contains("+") || version.startsWith("latest.") || version.matches(".*[\\[\\](),].*");
    }

    private static Map<String, Object> attributes(AttributeContainer container) {
        Map<String, Object> result = new TreeMap<>();
        for (Attribute<?> key : container.keySet()) result.put(key.getName(), String.valueOf(container.getAttribute(key)));
        return result;
    }

    private void addLocalFiles(Configuration configuration) {
        Set<String> seen = new HashSet<>();
        for (Dependency dependency : configuration.getAllDependencies()) {
            if (!(dependency instanceof FileCollectionDependency)) continue;
            List<File> files = new ArrayList<>(((FileCollectionDependency) dependency).getFiles().getFiles());
            files.sort(Comparator.comparing(File::getAbsolutePath));
            for (File file : files) {
                String relative = file.toPath().toAbsolutePath().normalize().startsWith(project.getRootDir().toPath().toAbsolutePath().normalize())
                    ? project.getRootProject().relativePath(file) : "外部文件/" + file.getName();
                if (!seen.add(relative)) continue;
                String target = "n" + nodes.size();
                boolean exists = file.isFile();
                nodes.add(object("id", target, "componentId", "file:" + relative, "kind", "file", "name", file.getName(),
                    "coordinate", relative, "version", null, "resolved", exists, "reasons", Collections.emptyList(),
                    "attributes", Collections.emptyMap(), "error", exists ? null : "本地文件不存在"));
                edges.add(object("id", "e" + edges.size(), "from", "root", "to", target,
                    "requested", object("kind", "file", "display", relative, "name", file.getName(), "version", null),
                    "constraint", false, "changeKind", "none"));
                if (!exists) issues.add(object("kind", "file", "target", target, "message", "本地文件不存在：" + relative));
            }
        }
    }

    public static String safeError(Throwable error) {
        return safeText(error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
    }

    public static String safeText(String text) {
        Matcher urls = Pattern.compile("https?://[^\\s<>\\\"']+").matcher(text);
        StringBuffer result = new StringBuffer();
        while (urls.find()) {
            String replacement = "[仓库地址]";
            try {
                URI uri = URI.create(urls.group());
                if (uri.getHost() != null) replacement = uri.getScheme() + "://" + uri.getHost() + "/[路径已省略]";
            } catch (IllegalArgumentException ignored) {
                // Failure messages can contain malformed URLs; omit the entire URL in that case.
            }
            urls.appendReplacement(result, Matcher.quoteReplacement(replacement));
        }
        urls.appendTail(result);
        return result.toString().replaceAll("(?:/Users/|/home/|[A-Za-z]:\\\\Users\\\\)[^\\s<>\\\"']+", "[本地路径]")
            .replaceAll("(?i)((?:token|password|secret|authorization)[=:]\\s*)[^\\s,;]+", "$1[已省略]");
    }

    private static final class Pending {
        final ResolvedComponentResult component;
        final ResolvedVariantResult variant;
        final String nodeId;
        Pending(ResolvedComponentResult component, ResolvedVariantResult variant, String nodeId) {
            this.component = component;
            this.variant = variant;
            this.nodeId = nodeId;
        }
    }
}

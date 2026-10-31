package dev.dependencylens;

import static org.junit.Assert.*;

import dev.dependencylens.analysis.Json;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipOutputStream;
import org.gradle.testkit.runner.BuildResult;
import org.gradle.testkit.runner.GradleRunner;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/** Real Gradle metadata resolution against a deterministic local Maven repository. */
public class DependencyGraphFunctionalTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private File root;

    @Before public void fixture() throws Exception {
        root=temporary.newFolder("project");
        write("settings.gradle", "rootProject.name='LensFixture'\ninclude 'app','core'\n");
        artifact("shared", "1.0", "");artifact("shared", "2.0", dep("leaf","1.0"));artifact("leaf","1.0", "");
        artifact("first", "1.0", dep("shared","1.0")+dep("excluded","1.0"));
        artifact("second", "1.0", dep("shared","2.0"));artifact("excluded","1.0", "");
        artifact("compile-only","1.0", "");artifact("runtime-only","1.0", "");
        write("repo/fixture/shared/maven-metadata.xml", "<metadata><groupId>fixture</groupId><artifactId>shared</artifactId><versioning><latest>2.0</latest><release>2.0</release><versions><version>1.0</version><version>2.0</version></versions><lastUpdated>20261031000000</lastUpdated></versioning></metadata>");
        write("repo/fixture/bom/1.0/bom-1.0.pom", "<project><modelVersion>4.0.0</modelVersion><groupId>fixture</groupId><artifactId>bom</artifactId><version>1.0</version><packaging>pom</packaging><dependencyManagement><dependencies>"+dep("shared","2.0")+"</dependencies></dependencyManagement></project>");
        write("app/libs/local.jar", "local file fixture");
        write("core/build.gradle", "plugins { id 'java-library' }\ndependencies { api 'fixture:leaf:1.0' }\n");
        write("app/build.gradle", "plugins { id 'java-library' }\ndependencies {\n"+
            " implementation('fixture:first:1.0') { exclude group:'fixture', module:'excluded' }\n"+
            " implementation 'fixture:second:1.0'\n implementation project(':core')\n implementation files('libs/local.jar')\n"+
            " compileOnly 'fixture:compile-only:1.0'\n runtimeOnly 'fixture:runtime-only:1.0'\n}\n");
        write("build.gradle", "import dev.dependencylens.analysis.CollectDependenciesTask\nimport org.gradle.api.attributes.Usage\n"+
            "plugins { id 'dev.dependencylens' }\n"+
            "allprojects { repositories { maven { url rootProject.uri('repo') } } }\n"+
            "subprojects { p ->\n p.pluginManager.withPlugin('java-library') {\n"+
            " def collect=p.tasks.register('collectLens', CollectDependenciesTask) { t ->\n"+
            "  modulePath.set(p.path); moduleType.set(p.name=='app'?'application':'library'); agpVersion.set('test-fixture');\n"+
            "  availableVariants.addAll('debug','release'); requestedVariants.set(rootProject.tasks.named('dependencyLensReport').get().requestedVariants);\n"+
            "  outputFile.set(p.layout.buildDirectory.file('dependency-lens/model.json'))\n }\n"+
            " ['debug','release'].each { v -> ['runtime','compile'].each { scope ->\n"+
            "  p.configurations.create(v+(scope=='runtime'?'RuntimeClasspath':'CompileClasspath')) { c ->\n"+
            "   canBeConsumed=false; canBeResolved=true;\n"+
            "   extendsFrom(p.configurations.getByName('implementation'),p.configurations.getByName(scope=='runtime'?'runtimeOnly':'compileOnly'));\n"+
            "   attributes { attribute(Usage.USAGE_ATTRIBUTE,p.objects.named(Usage,scope=='runtime'?Usage.JAVA_RUNTIME:Usage.JAVA_API)) }\n"+
            "  }\n } }\n"+
            " rootProject.tasks.named('dependencyLensReport') { r -> availableModules.add(p.path);\n"+
            "  if(requestedModules.get().empty || requestedModules.get().contains(p.path))moduleReports.from(collect.flatMap { it.outputFile })\n }\n"+
            " }\n}\n");
    }

    @Test public void resolvesDiamondProjectFilesAndSeparateClasspathsWithoutBuilding() throws Exception {
        BuildResult result=run("dependencyLensReport");
        Map<String,Object> runtime=graph("app","releaseRuntimeClasspath");
        assertEquals("complete",runtime.get("status"));
        Map<String,Object> shared=node(runtime,"shared");assertEquals("2.0",shared.get("version"));
        List<Map<String,Object>> incoming=edgesTo(runtime,shared.get("id"));
        assertEquals(2,incoming.size());assertTrue(incoming.stream().anyMatch(e->"version".equals(e.get("changeKind"))));
        assertTrue(nodes(runtime).stream().anyMatch(n->"project".equals(n.get("kind"))));
        assertTrue(nodes(runtime).stream().anyMatch(n->"file".equals(n.get("kind"))));
        assertFalse(nodes(runtime).stream().anyMatch(n->"excluded".equals(n.get("name"))));
        assertTrue(nodes(runtime).stream().anyMatch(n->"runtime-only".equals(n.get("name"))));
        assertFalse(nodes(runtime).stream().anyMatch(n->"compile-only".equals(n.get("name"))));
        Map<String,Object> compile=graph("app","releaseCompileClasspath");
        assertTrue(nodes(compile).stream().anyMatch(n->"compile-only".equals(n.get("name"))));
        assertFalse(nodes(compile).stream().anyMatch(n->"runtime-only".equals(n.get("name"))));
        assertTrue(new File(root,"build/reports/dependency-lens/index.html").isFile());
        assertFalse(result.getTasks().stream().anyMatch(t->t.getPath().endsWith(":compileJava")||t.getPath().endsWith(":jar")));
    }

    @Test public void keepsBomConstraintsAndDynamicSelectionsDistinctFromConflicts() throws Exception {
        append("app/build.gradle", "\ndependencies { implementation platform('fixture:bom:1.0'); implementation 'fixture:shared:2.+' }\n");
        run("dependencyLensReport","-PdependencyLens.variants=release");
        Map<String,Object> g=graph("app","releaseRuntimeClasspath");
        assertTrue(nodes(g).stream().anyMatch(n->"platform".equals(n.get("kind"))));
        assertTrue(edges(g).stream().anyMatch(e->Boolean.TRUE.equals(e.get("constraint"))));
        assertTrue(edges(g).stream().anyMatch(e->"dynamic".equals(e.get("changeKind"))));
    }

    @Test public void usesForcedVersionsAndRecordsSubstitution() throws Exception {
        append("app/build.gradle", "\nconfigurations.all { resolutionStrategy { force 'fixture:shared:1.0'; dependencySubstitution { substitute module('fixture:second') using project(':core') } } }\n");
        run("dependencyLensReport");Map<String,Object> g=graph("app","releaseRuntimeClasspath");
        assertEquals("1.0",node(g,"shared").get("version"));
        assertTrue(node(g,"shared").get("reasons").toString().contains("FORCED"));
        assertTrue(edges(g).stream().anyMatch(e->"substitution".equals(e.get("changeKind"))));
        append("settings.gradle", "\ninclude ':replacement'\n");
        write("replacement/build.gradle", "plugins { id 'java-library' }\n");
        append("app/build.gradle", "\nconfigurations.all { resolutionStrategy.dependencySubstitution { substitute project(':core') using project(':replacement') } }\n");
        run("dependencyLensReport");Map<String,Object> replaced=graph("app","releaseRuntimeClasspath");
        Object replacement=node(replaced,":replacement").get("id");
        assertTrue(edgesTo(replaced,replacement).stream().anyMatch(e->"substitution".equals(e.get("changeKind"))
            && ":core".equals(((Map<?,?>)e.get("requested")).get("name"))));
    }

    @Test public void writesPartialReportWhenOneDependencyIsMissing() throws Exception {
        append("app/build.gradle", "\ndependencies { implementation 'fixture:missing:99.0' }\n");
        run("dependencyLensReport","--offline");Map<String,Object> g=graph("app","releaseRuntimeClasspath");
        assertEquals("partial",g.get("status"));assertEquals("2.0",node(g,"shared").get("version"));
        assertTrue(nodes(g).stream().anyMatch(n->!Boolean.TRUE.equals(n.get("resolved"))));
        assertFalse(((List<?>)g.get("issues")).isEmpty());
    }

    @Test public void strictConstraintFailureRemainsVisible() throws Exception {
        append("app/build.gradle", "\ndependencies { implementation('fixture:shared') { version { strictly '1.0' } }; constraints { implementation('fixture:shared') { version { strictly '2.0' } } } }\n");
        run("dependencyLensReport");Map<String,Object> g=graph("app","releaseRuntimeClasspath");
        assertNotEquals("complete",g.get("status"));assertFalse(((List<?>)g.get("issues")).isEmpty());
    }

    @Test public void moduleAndVariantFilteringCannotLeakPreviousOutputs() throws Exception {
        run("dependencyLensReport");run("dependencyLensReport","-PdependencyLens.modules=:app","-PdependencyLens.variants=release");
        String html=Files.readString(new File(root,"build/reports/dependency-lens/index.html").toPath());
        String json=html.substring(html.indexOf("<script id=\"report-data\" type=\"application/json\">")+54);
        assertFalse(json.substring(0,json.indexOf("</script>")).contains("debugRuntimeClasspath"));
        assertFalse(json.substring(0,json.indexOf("</script>")).contains("\"path\":\":core\""));
    }

    @Test public void validatesUnknownFilters() {
        assertTrue(fail("dependencyLensReport","-PdependencyLens.modules=:unknown").getOutput().contains("不存在的 Android 模块"));
        assertTrue(fail("dependencyLensReport","-PdependencyLens.variants=notEnabled").getOutput().contains("不存在已启用的构建变体"));
    }

    @Test public void ordinaryBuildDoesNotResolveTheReportConfigurations() throws Exception {
        append("app/build.gradle", "\nconfigurations.all { incoming.beforeResolve { throw new GradleException('must not resolve during help') } }\n");
        BuildResult result=run("help");assertFalse(result.getTasks().stream().anyMatch(t->t.getPath().contains("collectLens")));
    }

    @Test public void doesNotMergeDependenciesOfDifferentSelectedVariants() throws Exception {
        artifact("fixture-only","1.0", "");
        append("core/build.gradle", "\napply plugin: 'java-test-fixtures'\ndependencies { testFixturesApi 'fixture:fixture-only:1.0' }\n");
        append("app/build.gradle", "\ndependencies { implementation testFixtures(project(':core')) }\n");
        run("dependencyLensReport");Map<String,Object> g=graph("app","releaseRuntimeClasspath");
        List<Map<String,Object>> variants=new ArrayList<>();
        for(Map<String,Object> n:nodes(g))if("project".equals(n.get("kind"))&&":core".equals(n.get("name")))variants.add(n);
        assertTrue(variants.size()>=2);
        String fixtureId=node(g,"fixture-only").get("id").toString();
        for(Map<String,Object> variant:variants){
            boolean includesFixture=edges(g).stream().anyMatch(e->variant.get("id").equals(e.get("from"))&&fixtureId.equals(e.get("to")));
            assertEquals(variant.get("variant").toString().toLowerCase().contains("testfixtures"),includesFixture);
        }
    }

    @Test public void terminatesMetadataCyclesWithoutDroppingTheBackEdge() throws Exception {
        artifact("cycle-a","1.0",dep("cycle-b","1.0"));artifact("cycle-b","1.0",dep("cycle-a","1.0"));
        append("app/build.gradle", "\ndependencies { implementation 'fixture:cycle-a:1.0' }\n");
        run("dependencyLensReport");Map<String,Object> g=graph("app","releaseRuntimeClasspath");
        Object a=node(g,"cycle-a").get("id"),b=node(g,"cycle-b").get("id");
        assertTrue(edges(g).stream().anyMatch(e->a.equals(e.get("from"))&&b.equals(e.get("to"))));
        assertTrue(edges(g).stream().anyMatch(e->b.equals(e.get("from"))&&a.equals(e.get("to"))));
        assertEquals("complete",g.get("status"));
    }

    private BuildResult run(String... args) {return runner(args).build();}
    private BuildResult fail(String... args) {return runner(args).buildAndFail();}
    private GradleRunner runner(String... args) {
        List<String> all=new ArrayList<>(List.of(args));all.add("--no-configuration-cache");all.add("--stacktrace");all.add("--console=plain");
        GradleRunner runner=GradleRunner.create().withProjectDir(root).withPluginClasspath().withArguments(all);
        String installation=System.getProperty("lens.testGradleHome");if(installation!=null)runner.withGradleInstallation(new File(installation));
        return runner;
    }
    @SuppressWarnings("unchecked") private Map<String,Object> graph(String module,String name) {
        List<Map<String,Object>> graphs=(List<Map<String,Object>>)Json.read(new File(root,module+"/build/dependency-lens/model.json")).get("graphs");
        return graphs.stream().filter(g->name.equals(g.get("configuration"))).findFirst().orElseThrow();
    }
    @SuppressWarnings("unchecked") private List<Map<String,Object>> nodes(Map<String,Object> g){return (List<Map<String,Object>>)g.get("nodes");}
    @SuppressWarnings("unchecked") private List<Map<String,Object>> edges(Map<String,Object> g){return (List<Map<String,Object>>)g.get("edges");}
    private Map<String,Object> node(Map<String,Object> g,String name){return nodes(g).stream().filter(n->name.equals(n.get("name"))).findFirst().orElseThrow();}
    private List<Map<String,Object>> edgesTo(Map<String,Object> g,Object id){List<Map<String,Object>> result=new ArrayList<>();for(Map<String,Object> e:edges(g))if(id.equals(e.get("to")))result.add(e);return result;}
    private static String dep(String artifact,String version){return "<dependency><groupId>fixture</groupId><artifactId>"+artifact+"</artifactId><version>"+version+"</version></dependency>";}
    private void artifact(String artifact,String version,String dependencies) throws IOException {
        String prefix="repo/fixture/"+artifact+"/"+version+"/"+artifact+"-"+version;
        write(prefix+".pom","<project><modelVersion>4.0.0</modelVersion><groupId>fixture</groupId><artifactId>"+artifact+"</artifactId><version>"+version+"</version><dependencies>"+dependencies+"</dependencies></project>");
        try(ZipOutputStream zip=new ZipOutputStream(Files.newOutputStream(new File(root,prefix+".jar").toPath()))) { }
    }
    private void write(String name,String text) throws IOException {File file=new File(root,name);Files.createDirectories(file.toPath().getParent());Files.writeString(file.toPath(),text,StandardCharsets.UTF_8);}
    private void append(String name,String text) throws IOException {File file=new File(root,name);Files.writeString(file.toPath(),Files.readString(file.toPath())+text);}
}

#!/usr/bin/env python3
"""Create explicitly labelled UI demonstration data, using the production HTML resources."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "src/main/resources/dev/dependencylens/report"


def graph(module, variant, scope):
    nodes = [{"id": "root", "componentId": "root", "name": module, "coordinate": module, "kind": "root", "resolved": True, "version": None, "reasons": [], "attributes": {}}]
    edges = []

    def node(name, version, group, kind="module", reason=None):
        key = "n" + str(len(nodes))
        nodes.append({"id": key, "componentId": key, "name": name, "group": group, "version": version,
                      "coordinate": group + ":" + name + ":" + version if version else name, "kind": kind,
                      "resolved": True, "variant": "runtimeElements" if scope == "runtime" else "apiElements",
                      "attributes": {"org.gradle.usage": "java-runtime" if scope == "runtime" else "java-api"},
                      "reasons": [{"cause": "CONFLICT_RESOLUTION", "description": reason}] if reason else []})
        return key

    def edge(source, target, requested, change="none"):
        n = next(n for n in nodes if n["id"] == target)
        edges.append({"id": "e" + str(len(edges)), "from": source, "to": target, "constraint": False,
                      "changeKind": change, "requested": {"display": n.get("group", "") + ":" + n["name"] + ":" + (requested or ""), "kind": "module", "group": n.get("group", ""), "name": n["name"], "version": requested}})

    retrofit = node("retrofit", "2.9.0", "com.squareup.retrofit2")
    okhttp = node("okhttp", "4.12.0", "com.squareup.okhttp3", reason="By conflict resolution: between versions 4.12.0 and 4.9.3")
    okio = node("okio-jvm", "3.6.0", "com.squareup.okio")
    logging = node("logging-interceptor", "4.12.0", "com.squareup.okhttp3")
    core = node("core-ktx", "1.12.0", "androidx.core")
    kotlin = node("kotlin-stdlib", "1.9.24", "org.jetbrains.kotlin", reason="By conflict resolution: between versions 1.9.24 and 1.8.21")
    gson = node("gson", "2.10.1", "com.google.code.gson")
    coroutines = node("kotlinx-coroutines-core-jvm", "1.8.1", "org.jetbrains.kotlinx")
    annotations = node("annotations", "23.0.0", "org.jetbrains")
    edge("root", retrofit, "2.9.0"); edge(retrofit, okhttp, "4.9.3", "version"); edge(okhttp, okio, "3.6.0")
    edge("root", logging, "4.12.0"); edge(logging, okhttp, "4.12.0")
    edge("root", core, "1.12.0"); edge(core, kotlin, "1.8.21", "version")
    edge("root", gson, "2.10.1"); edge("root", coroutines, "1.8.1"); edge(coroutines, kotlin, "1.9.24")
    edge(okio, kotlin, "1.9.24"); edge(kotlin, annotations, "23.0.0")
    if scope == "compile":
        compile_only = node("checker-qual", "3.37.0", "org.checkerframework")
        edge("root", compile_only, "3.37.0")
    return {"id": module + "|" + variant + scope, "module": module, "variant": variant, "scope": scope,
            "configuration": variant + ("RuntimeClasspath" if scope == "runtime" else "CompileClasspath"),
            "rootId": "root", "status": "complete", "nodes": nodes, "edges": edges, "issues": []}


def render(data):
    def safe(value):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    html = (RES / "index.html").read_text()
    scripts = "".join("\n<script>\n" + (RES / f).read_text().replace("</script", "<\\/script") + "\n</script>\n"
                      for f in ["vendor/dagre.min.js", "icons.js", "model.js", "tree.js", "paths.js", "details.js", "app.js"])
    licenses = {"Dagre 1.1.5": (RES / "vendor/dagre-LICENSE.txt").read_text(), "Tabler Icons 3.35.0": (RES / "vendor/tabler-LICENSE.txt").read_text()}
    return html.replace("/*__STYLES__*/", (RES / "style.css").read_text()).replace("<!--__DATA__-->", '<script id="report-data" type="application/json">' + safe(data) + '</script>').replace("<!--__LICENSES__-->", '<script id="third-party-licenses" type="application/json">' + safe(licenses) + '</script>').replace("<!--__SCRIPTS__-->", scripts)


if __name__ == "__main__":
    data = {"schemaVersion": 1, "projectName": "MercuryShop", "generatedAt": "2026-10-31T18:00:00+08:00", "pluginVersion": "0.1.0", "gradleVersion": "8.13", "demo": True,
            "modules": [{"path": name, "type": "application" if name == ":app" else "library", "agpVersion": "8.13.2",
                         "graphs": [graph(name, variant, scope) for variant in ["debug", "release"] for scope in ["runtime", "compile"]]}
                        for name in [":app", ":core", ":network"]]}
    target = ROOT / "reports/demo.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(render(data))
    print(target)

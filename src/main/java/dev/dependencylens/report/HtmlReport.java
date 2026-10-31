package dev.dependencylens.report;

import dev.dependencylens.analysis.Json;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

public final class HtmlReport {
    private static final String BASE = "/dev/dependencylens/report/";
    private HtmlReport() {}

    public static String render(Map<String, Object> data) throws IOException {
        StringBuilder scripts = new StringBuilder();
        for (String file : new String[]{"vendor/dagre.min.js", "icons.js", "model.js", "tree.js", "paths.js", "details.js", "app.js"}) {
            scripts.append("\n<script>\n").append(resource(file).replace("</script", "<\\/script")).append("\n</script>\n");
        }
        return resource("index.html").replace("/*__STYLES__*/", resource("style.css"))
            .replace("<!--__DATA__-->", "<script id=\"report-data\" type=\"application/json\">" + Json.embedded(data) + "</script>")
            .replace("<!--__LICENSES__-->", "<script id=\"third-party-licenses\" type=\"application/json\">" + Json.embedded(Json.object(
                "Dagre 1.1.5", resource("vendor/dagre-LICENSE.txt"), "Tabler Icons 3.35.0", resource("vendor/tabler-LICENSE.txt"))) + "</script>")
            .replace("<!--__SCRIPTS__-->", scripts.toString());
    }

    private static String resource(String name) throws IOException {
        try (InputStream stream = HtmlReport.class.getResourceAsStream(BASE + name)) {
            if (stream == null) throw new IOException("缺少报告资源：" + name);
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}

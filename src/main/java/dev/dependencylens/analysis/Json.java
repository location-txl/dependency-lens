package dev.dependencylens.analysis;

import groovy.json.JsonOutput;
import groovy.json.JsonSlurper;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.Map;

/** JSON values are Maps/Lists/scalars; no Gradle model objects cross the report boundary. */
public final class Json {
    private Json() {}

    public static Map<String, Object> object(Object... pairs) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
        return result;
    }

    public static String stringify(Object value) { return JsonOutput.toJson(value); }

    public static String embedded(Object value) {
        return stringify(value).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
            .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029");
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> read(File file) { return (Map<String, Object>) new JsonSlurper().parse(file, "UTF-8"); }

    public static void write(File file, Object data) throws IOException { writeText(file, stringify(data)); }

    public static void writeText(File file, String text) throws IOException {
        Files.createDirectories(file.toPath().getParent());
        Files.write(file.toPath(), text.getBytes(StandardCharsets.UTF_8));
    }
}

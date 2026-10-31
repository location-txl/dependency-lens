package dev.dependencylens;

import static org.junit.Assert.*;
import dev.dependencylens.analysis.GraphCollector;
import dev.dependencylens.analysis.Json;
import dev.dependencylens.report.HtmlReport;
import java.util.Collections;
import org.junit.Test;

public class ReportTest {
    @Test public void embeddedMetadataCannotTerminateScript() {
        String encoded = Json.embedded(Json.object("name", "</script><script>alert('x')</script>&\u2028"));
        assertFalse(encoded.contains("</script"));
        assertTrue(encoded.contains("\\u003c"));
        assertTrue(encoded.contains("\\u2028"));
    }

    @Test public void errorsOmitRepositoryCredentialsQueriesAndLocalPaths() {
        String safe = GraphCollector.safeText("Could not GET https://user:pass@example.org/a?token=secret from /Users/person/.gradle/cache token=abcdef");
        assertFalse(safe.contains("user:pass"));assertFalse(safe.contains("secret"));assertFalse(safe.contains("abcdef"));assertFalse(safe.contains("/Users/person"));assertTrue(safe.contains("example.org"));
    }

    @Test public void dynamicSelectorsAreNotFixedVersionChanges() {
        for(String value:new String[]{"1.+","latest.release","[1.0,2.0)","1.0+"})assertTrue(value,GraphCollector.dynamicVersion(value));
        assertFalse(GraphCollector.dynamicVersion("1.0.0-rc01"));
    }

    @Test public void reportEmbedsEveryResourceAndHasNoExternalFetch() throws Exception {
        String html=HtmlReport.render(Json.object("modules", Collections.emptyList(), "projectName","安全 </script>"));
        assertFalse(html.contains("<!--__"));assertFalse(html.contains("/*__STYLES__*/"));assertFalse(html.contains("<script src="));assertFalse(html.contains("<link rel="));assertTrue(html.contains("connect-src 'none'"));assertTrue(html.contains("dagre"));assertTrue(html.contains("third-party-licenses"));assertTrue(html.contains("\\u003c/script\\u003e"));
    }
}

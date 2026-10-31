# 验证记录

日期：2026-10-31。插件版本：0.1.0。

## 已通过的检查

- 使用 JDK 11、项目自身 Gradle Wrapper 7.0.2 执行 `check jar publishToMavenLocal --no-configuration-cache --no-daemon`，构建成功。
- JVM 测试 14 项：4 项单元/报告安全测试、10 项 Gradle TestKit 依赖解析测试；失败和错误均为 0。替换测试同时覆盖模块到项目、项目到另一个项目的替换。
- Node.js 图逻辑测试 9 项，全部通过；包括 10,000 节点算法、菱形、多来源、循环、版本变化分类与子树展开回归。
- Gradle `validatePlugins` 通过；插件 Java class 文件目标为 Java 11（major version 55）。
- 本地 Maven 同时生成实现包、源码包和 `dev.dependencylens.gradle.plugin` Marker。
- Groovy DSL 示例从本地 Maven 真实接入，4 个 Android 模块、20 张独立配置图，生成标准位置报告。任务列表只有 4 个采集任务和根报告任务。
- Kotlin DSL 示例通过 plugins DSL 的 Marker 真实接入，生成自定义的 `custom.html`；任务列表只有采集及报告任务。
- 浏览器界面验收通过，见 [设计验收](../design-qa.md)。图中多路径汇合、请求版本、树定位和画布操作均可使用。真实 Android 示例生成的报告也已在浏览器确认 shared 的请求 1.0/2.0、最终版本 2.0 及项目依赖路径，见 [截图](screenshots/android-example.png)。

TestKit 使用可控的本地 Maven 仓库，覆盖版本冲突、强制版本、BOM/约束、严格约束失败、动态版本、模块依赖、本地文件、替换、排除、不同选中变体、配置差异、循环、未解析依赖、离线缺失、筛选及旧结果隔离。TestKit 中的 Java 模块图测试用于隔离 Gradle 解析语义；以下矩阵才是真实 Android AGP 验证。

## Android 兼容矩阵

27 个锁定组合中，**22 个通过，5 个因下载环境阻断而未完成**。逐项原始结果及 Java 类校验摘要见 [compatibility-results-full.json](compatibility-results-full.json)，可复现的版本清单见 [compatibility-matrix.json](compatibility-matrix.json)。

每个通过组合都实际执行 4 个 Android 模块、20 张编译/运行时配置图；覆盖 Flavor、禁用 paidDebug 变体、Dynamic Feature、模块与本地 JAR 依赖。断言最终 shared 版本为 2.0、保留请求 1.0 的边、编译与运行时专属依赖不混合，并与 `dependencyInsight` 对照。执行列表确认没有触发编译或打包。

另外执行示例的 Gradle `dependencies`，确认完整依赖树中的 `shared:1.0 -> 2.0`、second 及 network 模块关系与报告一致，见 [输出记录](dependencies-output.txt)。最终构建输出见 [check-output.txt](check-output.txt)，测试计数见 [test-results.json](test-results.json)。

| AGP | Gradle | JDK | 结果 |
|---|---|---|---|
| 7.0.0 / 7.0.4 | 7.0.2 | 11 | 通过 |
| 7.1.3 | 7.2 | 11 | 通过 |
| 7.2.2 | 7.3.3 | 11 | 通过 |
| 7.3.1 | 7.4 | 11 | 通过 |
| 7.4.2 | 7.5 | 11 | 通过 |
| 8.0.2 / 8.1.4 | 8.0.2 | 17 | 通过 |
| 8.2.2 | 8.2 | 17 | 通过 |
| 8.3.2 | 8.4 | 17 | 通过 |
| 8.4.2 | 8.6 | 17 | 通过 |
| 8.5.2 / 8.6.1 | 8.7 | 17 | 通过 |
| 8.7.3 | 8.9 | 17 | 通过 |
| 8.8.2 | 8.10.2 | 17 | 下载阻断，未完成 |
| 8.9.3 / 8.10.1 | 8.11.1 | 17 | 下载阻断，未完成 |
| 8.11.2 / 8.12.3 / 8.13.2 | 8.13 | 17 | 通过 |
| 9.0.1 | 9.1.0 | 17 | 通过 |
| 9.1.1 | 9.3.1 | 17 | 通过 |
| 9.2.1 | 9.4.1 | 17 | 下载阻断，未完成 |
| 9.3.3 | 9.5.0 | 17 | 下载阻断，未完成 |
| 9.4.1 | 9.6.0 | 17 | 通过 |
| 9.5.0 | 9.6.0 / 9.8.2 | 17 | 两个组合均通过 |

前期下载失败的 7.3～8.7 组合已补跑通过。剩余 5 个组合的官方 Gradle 分发包遇到 TLS 握手失败；改用已安装的 Gradle 8.13 / 9.6.0 后，又在 Google Maven 下载对应 AGP 时遇到相同错误，没有执行到插件任务。因此既不判定为插件不兼容，也不将其列为已验证兼容。网络恢复后可使用 `--agp 8.8.2,8.9.3,8.10.1,9.2.1,9.3.3 --matrix full` 精确补跑。

补齐项目到项目的替换分类后，使用交付的最终 JAR 重新执行全部 22 个可运行组合，均通过；各条结果记录了同一份插件 JAR 的 SHA-256。最终版本另外执行完整 `check` 和两种 DSL 的本地 Maven 接入。界面资源在浏览器验收后没有再修改。

## 单文件与安全

- 生成报告内嵌 JSON、CSS、Dagre、Tabler 图标和第三方许可证，无 CDN、外部字体或脚本加载。
- 元数据作为文本节点渲染；嵌入 JSON 对 `<`、`>`、`&` 等字符编码。自动测试验证恶意 `</script>` 内容不会逃逸。
- CSP 的 `connect-src 'none'` 等策略禁止报告联网；没有为了验收降低 TLS 校验或修改系统代理、路由设置。
- 错误摘要省略仓库 URL 的路径和查询参数、常见凭据及用户目录。报告本身仍包含项目依赖信息，按项目自身的共享规则处理即可。
- 分发包使用 Gradle 官方 SHA-256 校验。当前环境中 Wrapper 首次联网下载曾失败，使用已通过同一官方校验的分发 ZIP 放入正常 Wrapper 缓存后运行成功，没有伪造完成标记或关闭证书检查。

## 未执行的验收

- Safari、独立 Chrome、直接 `file://` 打开及真实断网操作；实际界面验收为内置 Chromium 的回环 HTTP 预览，静态自包含由测试验证。
- 全量读屏器、真实公司 Android 工程、包含构建的专项集成、APK/AAB 与 R8 代码留存；其中 APK/AAB 和 R8 分析不属于首版功能。
- 远程 Maven、Gradle Plugin Portal 的公开发布。当前只执行本机 Maven 发布。

兼容目标保持 AGP 7.0.x～9.5.x；上述未完成组合补齐前，不应对外宣称整个版本区间已经全部测试通过。

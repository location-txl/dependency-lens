(function () {
  "use strict";
  const reasonNames = {
    CONFLICT_RESOLUTION: "版本冲突解决",
    FORCED: "强制版本",
    CONSTRAINT: "依赖约束",
    SELECTED_BY_RULE: "规则选择",
    COMPOSITE_BUILD: "包含构建替换",
    REJECTION: "候选版本被拒绝",
    REQUESTED: "依赖请求",
    ROOT: "根组件",
    BY_ANCESTOR: "上游严格约束",
  };
  window.LensDetails = {
    render(app) {
      const { el, icon, empty, changeLabel } = window.LensUI,
        s = app.state,
        host = document.getElementById("dependency-details");
      const node = s.idx.nodes.get(s.selectedId);
      if (!node || node.id === s.idx.root) {
        host.replaceChildren(
          empty(
            "选择一个依赖",
            "查看最终解析版本、选择原因，以及它的引入路径。",
            "cube",
          ),
        );
        return;
      }
      const copy = el(
        "button",
        {
          class: "copy-btn",
          "aria-label": "复制依赖坐标",
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(node.coordinate);
              copy.replaceChildren(
                icon("check"),
                document.createTextNode("已复制"),
              );
            } catch (_) {
              const box = el(
                "textarea",
                {
                  class: "coordinate-box",
                  readonly: true,
                  "aria-label": "可复制的依赖坐标",
                },
                node.coordinate,
              );
              host.prepend(box);
              box.focus();
              box.select();
            }
          },
        },
        icon("copy"),
        "复制坐标",
      );
      const title = el(
        "div",
        { class: "details-header" },
        el("h2", {}, node.name),
        copy,
        el(
          "div",
          { class: "details-group" },
          node.group ? node.group + ":" + node.name : node.coordinate,
        ),
      );
      const version = el(
        "section",
        { class: "detail-section" },
        el(
          "div",
          { class: "detail-label" },
          node.resolved ? "最终解析版本" : "解析状态",
        ),
        el(
          "div",
          {
            class: "final-version" + (!node.resolved ? " error-text" : ""),
            style: node.version ? "" : "font-size:26px",
          },
          node.version ||
            (!node.resolved
              ? "未解析"
              : node.kind === "file"
                ? "本地文件"
                : node.kind === "platform"
                  ? "平台依赖"
                  : "项目依赖"),
        ),
        node.kind === "platform"
          ? el(
              "p",
              { class: "detail-note" },
              "平台用于管理版本，不包含运行时代码。",
            )
          : null,
        !node.resolved
          ? el(
              "p",
              { class: "detail-note error-text" },
              node.error || "请检查依赖声明、仓库或离线缓存。",
            )
          : null,
      );
      const incoming = s.idx.incoming.get(node.id) || [],
        requestRows = new Map();
      for (const edge of incoming) {
        const version =
          edge.requested.version ||
          edge.requested.versionConstraint?.strict ||
          edge.requested.versionConstraint?.preferred ||
          (edge.requested.kind === "module"
            ? "由约束确定"
            : edge.requested.display);
        const key =
          String(version) + "|" + edge.changeKind + "|" + edge.constraint;
        if (!requestRows.has(key)) requestRows.set(key, { version, edge });
      }
      const requests = el(
        "section",
        { class: "detail-section" },
        el("h3", {}, "请求版本"),
      );
      for (const { version: v, edge } of requestRows.values())
        requests.append(
          el(
            "div",
            {
              class:
                "request-row" +
                (window.LensModel.changed(edge) ? " changed" : ""),
            },
            el("span", {}, v),
            icon("arrow-right"),
            el(
              "span",
              {},
              node.version ||
                (!node.resolved
                  ? "未解析"
                  : node.kind === "file"
                    ? "本地文件"
                    : "项目依赖"),
            ),
            edge.constraint
              ? el("small", {}, "约束")
              : changeLabel(edge)
                ? el("small", {}, changeLabel(edge))
                : null,
          ),
        );
      const reasons = el(
        "section",
        { class: "detail-section" },
        el("h3", {}, icon("stack-2"), "选择原因"),
      );
      const meaningful = (node.reasons || []).filter(
        (r) => r.cause !== "REQUESTED" && r.cause !== "ROOT",
      );
      if (!meaningful.length)
        reasons.append(
          el(
            "div",
            { class: "reason-item" },
            el(
              "div",
              { class: "reason-title" },
              node.kind === "file" ? "本地文件依赖" : "按依赖请求解析",
            ),
            el(
              "p",
              { class: "reason-description" },
              node.kind === "file"
                ? "文件没有可用的外部传递依赖元数据。"
                : "Gradle 未报告额外的冲突、强制版本或替换原因。",
            ),
          ),
        );
      for (const reason of meaningful) {
        const explanation =
          reason.cause === "CONFLICT_RESOLUTION"
            ? "多个依赖请求了不同版本，Gradle 选择了 " +
              (node.version || node.coordinate) +
              "。"
            : null;
        reasons.append(
          el(
            "div",
            { class: "reason-item" },
            el(
              "div",
              { class: "reason-title" },
              reasonNames[reason.cause] || reason.cause,
            ),
            el(
              "p",
              { class: "reason-description" },
              explanation || reason.description,
            ),
            explanation
              ? el(
                  "details",
                  { class: "reason-raw" },
                  el("summary", {}, "Gradle 原始原因"),
                  el("p", { class: "reason-description" }, reason.description),
                )
              : null,
          ),
        );
      }
      const constraints = incoming.filter((e) => e.constraint);
      if (constraints.length)
        reasons.append(
          el(
            "div",
            { class: "reason-item" },
            el("div", { class: "reason-title" }, "约束来源"),
            ...constraints.map((e) =>
              el(
                "p",
                { class: "reason-description" },
                s.idx.nodes.get(e.from).coordinate +
                  " · " +
                  e.requested.display,
              ),
            ),
          ),
        );
      const allPaths = window.LensModel.introductionPaths(s.idx, node.id),
        paths = el(
          "section",
          { class: "detail-section" },
          el("h3", {}, icon("arrows-split"), "引入路径"),
        );
      if (!allPaths.length)
        paths.append(
          el(
            "p",
            { class: "detail-note" },
            "当前依赖没有普通引入路径，请查看约束来源或解析问题。",
          ),
        );
      allPaths.slice(0, s.detailsPathLimit).forEach((path, i) => {
        const line = el(
          "div",
          { class: "path-coordinates" },
          el("span", {}, s.idx.nodes.get(s.idx.root).name),
        );
        for (const edge of path) {
          const n = s.idx.nodes.get(edge.to);
          line.append(
            el("span", { class: "path-arrow" }, "→"),
            el(
              "span",
              { title: edge.requested.display },
              (n.group ? n.group + ":" : "") +
                n.name +
                (n.version ? ":" + n.version : ""),
            ),
          );
        }
        paths.append(
          el(
            "div",
            { class: "incoming-path" },
            el("span", { class: "path-number" }, i + 1),
            line,
          ),
        );
      });
      if (allPaths.length > s.detailsPathLimit)
        paths.append(
          el(
            "button",
            {
              class: "text-button",
              onclick: () => {
                s.detailsPathLimit += 6;
                app.renderDetails();
              },
            },
            "显示更多来源（" + (allPaths.length - s.detailsPathLimit) + "）",
          ),
        );
      if (allPaths.length)
        paths.append(
          el(
            "p",
            { class: "detail-note" },
            "每个直接来源展示一条最短路径，完整关系见依赖路径视图。",
          ),
        );
      paths.append(
        el(
          "button",
          { class: "text-button", onclick: () => app.locateTree(node.id) },
          "在依赖树中定位",
          icon("arrow-right"),
        ),
      );
      const children = (s.idx.outgoing.get(node.id) || []).filter(
        (e) => !e.constraint,
      );
      const childSection = el(
        "section",
        { class: "detail-section" },
        el("h3", {}, "直接子依赖"),
      );
      if (!children.length)
        childSection.append(
          el("p", { class: "detail-note" }, "当前解析变体没有直接子依赖。"),
        );
      const unique = new Set();
      for (const edge of children) {
        if (unique.has(edge.to)) continue;
        unique.add(edge.to);
        const n = s.idx.nodes.get(edge.to);
        childSection.append(
          el(
            "button",
            { class: "child-item", onclick: () => app.select(n.id, edge.id) },
            n.coordinate,
          ),
        );
      }
      const attributes = el(
        "details",
        { class: "variant-details" },
        el("summary", {}, "已选变体与属性"),
      );
      const attrList = el("dl", { class: "attribute-list" });
      if (node.variant)
        attrList.append(el("dt", {}, "variant"), el("dd", {}, node.variant));
      for (const [key, value] of Object.entries(node.attributes || {}))
        attrList.append(el("dt", {}, key), el("dd", {}, value));
      for (const cap of node.capabilities || [])
        attrList.append(el("dt", {}, "capability"), el("dd", {}, cap));
      attributes.append(attrList);
      host.replaceChildren(
        title,
        version,
        requests,
        reasons,
        paths,
        childSection,
        attributes,
      );
    },
  };
})();

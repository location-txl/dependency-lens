(function () {
  "use strict";
  const data = JSON.parse(document.getElementById("report-data").textContent),
    M = window.LensModel;
  function el(tag, attrs = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (k === "class") n.className = v;
      else if (k === "readonly") n.readOnly = Boolean(v);
      else n.setAttribute(k, String(v));
    }
    for (const child of children.flat())
      if (child !== null && child !== undefined)
        n.append(
          typeof child === "object"
            ? child
            : document.createTextNode(String(child)),
        );
    return n;
  }
  function icon(name) {
    const t = document.createElement("template");
    t.innerHTML = window.LensIcons[name] || window.LensIcons.cube;
    const n = t.content.firstElementChild;
    n.classList.add("icon");
    n.setAttribute("aria-hidden", "true");
    return n;
  }
  function empty(title, description, name) {
    return el(
      "div",
      { class: "empty-state" },
      icon(name),
      el("h3", {}, title),
      el("p", {}, description),
    );
  }
  const typeLabel = (n) =>
    ({ project: "项目", platform: "平台", file: "本地", unresolved: "未解析" })[
      n.kind
    ] || "";
  const changeLabel = (e) =>
    ({
      version: "版本变化",
      substitution: "依赖替换",
      dynamic: "动态解析",
      managed: "约束定版",
    })[e.changeKind] || "";
  window.LensUI = { el, icon, empty, typeLabel, changeLabel };
  document
    .querySelectorAll("[data-icon]")
    .forEach((n) => n.replaceChildren(icon(n.dataset.icon)));
  const modules = [...data.modules].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  const first = modules.find((m) => m.type === "application") || modules[0];
  const s = {
    module: first.path,
    variant: "",
    scope: "runtime",
    idx: null,
    mode: "tree",
    selectedId: null,
    selectedEdge: null,
    query: "",
    changesOnly: false,
    expanded: new Set(["root"]),
    rowLimit: 500,
    pathLimit: 200,
    childExpanded: new Set(),
    detailsPathLimit: 6,
    filter: null,
  };
  const app = {
    state: s,
    data,
    select(id, edge) {
      if (s.selectedId !== id) {
        s.childExpanded = new Set([id]);
        s.detailsPathLimit = 6;
        s.pathLimit = 200;
      }
      s.selectedId = id;
      s.selectedEdge = edge || null;
      this.renderView();
      this.renderDetails();
    },
    renderDetails() {
      window.LensDetails.render(this);
    },
    renderView() {
      document.getElementById("tree-view").hidden = s.mode !== "tree";
      document.getElementById("paths-view").hidden = s.mode !== "paths";
      document
        .getElementById("tree-tab")
        .setAttribute("aria-selected", String(s.mode === "tree"));
      document
        .getElementById("paths-tab")
        .setAttribute("aria-selected", String(s.mode === "paths"));
      document.getElementById("current-dependency").textContent =
        s.selectedId && s.idx.nodes.get(s.selectedId)
          ? "当前依赖：" + s.idx.nodes.get(s.selectedId).name
          : "";
      if (s.mode === "tree") window.LensTree.render(this);
      else window.LensPaths.render(this);
    },
    locateTree(id) {
      const path = M.shortestPath(s.idx, id);
      if (path === null) {
        document.getElementById("announcement").textContent =
          "此组件仅由约束引用，没有普通引入路径。";
        return;
      }
      s.query = "";
      s.changesOnly = false;
      s.filter = null;
      document.getElementById("search").value = "";
      document.getElementById("changes-only").checked = false;
      document.getElementById("clear-search").hidden = true;
      let key = "root";
      s.expanded.add(key);
      for (const edge of path) {
        key += "/" + edge.id;
        s.expanded.add(key);
      }
      s.mode = "tree";
      s.rowLimit = Math.max(500, path.length + 50);
      s.selectedId = id;
      s.selectedEdge = path[path.length - 1]?.id || null;
      this.renderView();
      this.renderDetails();
      let target = document.querySelector(
        '[data-path="' + CSS.escape(key) + '"]',
      );
      while (!target && document.querySelector(".load-more")) {
        s.rowLimit += 500;
        this.renderView();
        target = document.querySelector(
          '[data-path="' + CSS.escape(key) + '"]',
        );
      }
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    },
    updateFilters() {
      s.filter = M.matches(s.idx, s.query, s.changesOnly);
      s.rowLimit = 500;
      if (s.mode === "paths" && s.filter && !s.filter.hits.has(s.selectedId)) {
        s.selectedId = [...s.filter.hits][0] || null;
        s.selectedEdge = null;
        s.childExpanded = new Set([s.selectedId]);
        s.detailsPathLimit = 6;
        s.pathLimit = 200;
      }
      this.renderView();
      this.renderDetails();
    },
  };
  function selectOptions(select, values, selected) {
    select.replaceChildren(
      ...values.map((v) =>
        el(
          "option",
          {
            value: v.value ?? v,
            ...(String(v.value ?? v) === String(selected)
              ? { selected: "" }
              : {}),
          },
          v.label ?? v,
        ),
      ),
    );
  }
  function changeGraph(modulePath, variant, scope) {
    s.module = modulePath;
    const module = modules.find((m) => m.path === modulePath),
      variants = [...new Set(module.graphs.map((g) => g.variant))].sort();
    s.variant = variants.includes(variant)
      ? variant
      : variants.includes("release")
        ? "release"
        : variants[0];
    const graphs = module.graphs.filter((g) => g.variant === s.variant);
    s.scope = graphs.some((g) => g.scope === scope)
      ? scope
      : graphs.some((g) => g.scope === "runtime")
        ? "runtime"
        : graphs[0].scope;
    s.idx = M.index(graphs.find((g) => g.scope === s.scope));
    s.selectedId = null;
    s.selectedEdge = null;
    s.expanded = new Set(["root"]);
    s.rowLimit = 500;
    s.pathLimit = 200;
    s.detailsPathLimit = 6;
    s.childExpanded = new Set();
    s.filter = M.matches(s.idx, s.query, s.changesOnly);
    selectOptions(
      document.getElementById("module-select"),
      modules.map((m) => m.path),
      s.module,
    );
    selectOptions(
      document.getElementById("variant-select"),
      variants,
      s.variant,
    );
    selectOptions(
      document.getElementById("scope-select"),
      graphs.map((g) => ({ value: g.scope, label: g.configuration })),
      s.scope,
    );
    document.querySelectorAll(".module-btn").forEach((n) => {
      n.classList.toggle("active", n.dataset.module === s.module);
      if (n.dataset.module === s.module) n.setAttribute("aria-current", "true");
      else n.removeAttribute("aria-current");
    });
    const stats = M.stats(s.idx);
    document
      .getElementById("stats")
      .replaceChildren(
        el("span", {}, "直接依赖", el("strong", {}, stats.direct)),
        el("span", {}, "传递依赖", el("strong", {}, stats.transitive)),
        el(
          "span",
          {},
          "版本变化",
          el("strong", { class: "changed-count" }, stats.changes),
        ),
      );
    document.getElementById("scope-note").textContent =
      "当前视图：" +
      (s.scope === "runtime" ? "运行时" : "编译时") +
      "依赖解析结果";
    const banner = document.getElementById("issue-banner"),
      issues = s.idx.graph.issues || [];
    banner.hidden = s.idx.graph.status === "complete";
    banner.replaceChildren();
    if (!banner.hidden) {
      const details = el(
        "details",
        {},
        el(
          "summary",
          {},
          (s.idx.graph.status === "failed"
            ? "此配置解析失败"
            : "此配置存在解析问题") +
            " · 当前报告可能不完整（" +
            issues.length +
            " 项）",
        ),
        el(
          "ul",
          {},
          ...issues.map((i) =>
            el("li", {}, (i.requested ? i.requested + "：" : "") + i.message),
          ),
        ),
      );
      banner.append(details);
    }
    app.renderView();
    app.renderDetails();
  }
  document.getElementById("project-name").textContent = data.projectName;
  document.getElementById("plugin-version").textContent = data.pluginVersion;
  document.getElementById("report-date").textContent =
    (data.demo ? "演示数据 · " : "") + String(data.generatedAt).slice(0, 10);
  document.getElementById("environment").textContent =
    "Gradle " + data.gradleVersion;
  document.title = data.projectName + " · 依赖分析报告";
  document
    .getElementById("module-nav")
    .replaceChildren(
      ...modules.map((m) =>
        el(
          "button",
          {
            class: "module-btn",
            "data-module": m.path,
            onclick: () => changeGraph(m.path, s.variant, s.scope),
          },
          m.path,
        ),
      ),
    );
  document
    .getElementById("module-select")
    .addEventListener("change", (e) =>
      changeGraph(e.target.value, s.variant, s.scope),
    );
  document
    .getElementById("variant-select")
    .addEventListener("change", (e) =>
      changeGraph(s.module, e.target.value, s.scope),
    );
  document
    .getElementById("scope-select")
    .addEventListener("change", (e) =>
      changeGraph(s.module, s.variant, e.target.value),
    );
  let searchTimer;
  document.getElementById("search").addEventListener("input", (e) => {
    s.query = e.target.value;
    document.getElementById("clear-search").hidden = !s.query;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => app.updateFilters(), 100);
  });
  document.getElementById("clear-search").addEventListener("click", () => {
    clearTimeout(searchTimer);
    s.query = "";
    document.getElementById("search").value = "";
    document.getElementById("clear-search").hidden = true;
    app.updateFilters();
    document.getElementById("search").focus();
  });
  document.getElementById("changes-only").addEventListener("change", (e) => {
    s.changesOnly = e.target.checked;
    app.updateFilters();
  });
  for (const mode of ["tree", "paths"])
    document.getElementById(mode + "-tab").addEventListener("click", () => {
      s.mode = mode;
      app.updateFilters();
    });
  const dialog = document.getElementById("about-dialog");
  document.getElementById("about-button").addEventListener("click", () => {
    document
      .getElementById("about-content")
      .replaceChildren(
        el("h3", {}, data.projectName),
        el("p", {}, "生成时间：" + data.generatedAt),
        el(
          "p",
          {},
          "Dependency Lens " +
            data.pluginVersion +
            " · Gradle " +
            data.gradleVersion,
        ),
        ...modules.map((m) => el("p", {}, m.path + " · AGP " + m.agpVersion)),
        el("h3", {}, "解析结果说明"),
        el(
          "p",
          {},
          "结果只对应各模块、变体和 Configuration。本地文件没有可推断的外部依赖元数据；平台与约束管理版本。报告不执行 APK/AAB 或 R8 代码留存分析。",
        ),
        el("h3", {}, "第三方许可证"),
        el(
          "p",
          {},
          "Dagre 1.1.5 / Graphlib：MIT License，Copyright (c) 2012–2014 Chris Pettitt。Tabler Icons 3.35.0：MIT License，Copyright (c) 2020 Paweł Kuna。许可允许使用、复制、修改、合并、发布、分发、再许可及销售，但须保留版权与许可声明。软件按“原样”提供，不附带任何明示或暗示保证，包括适销性、特定用途适用性或不侵权保证；作者不对使用软件产生的损害或其他责任负责。完整原文见插件发行包中的 THIRD-PARTY-NOTICES.txt。",
        ),
      );
    const licenses = JSON.parse(
      document.getElementById("third-party-licenses").textContent,
    );
    for (const [name, text] of Object.entries(licenses))
      document
        .getElementById("about-content")
        .append(
          el(
            "details",
            {},
            el("summary", {}, name + " 完整许可证"),
            el("pre", { style: "white-space:pre-wrap;font-size:10px" }, text),
          ),
        );
    dialog.showModal();
  });
  document
    .getElementById("close-about")
    .addEventListener("click", () => dialog.close());
  document.querySelector(".brand").addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("search").focus();
  });
  window.addEventListener("resize", () => {
    if (s.mode === "paths") app.renderView();
  });
  changeGraph(first.path, "release", "runtime");
})();

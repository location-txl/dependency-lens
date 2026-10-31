(function () {
  "use strict";
  window.LensTree = {
    render(app) {
      const { el, icon, empty, typeLabel, changeLabel } = window.LensUI;
      const { state: s } = app,
        host = document.getElementById("tree-view"),
        scroll = host.scrollTop;
      const header = el(
        "div",
        { class: "tree-header", role: "row" },
        el("span", {}, "依赖"),
        el("span", {}, "请求版本"),
        el("span", {}, "最终解析版本"),
      );
      const list = el("div", { role: "tree", "aria-label": "依赖树" });
      const rows = window.LensModel.treeRows(s.idx, s.expanded, s.filter);
      let count = 0,
        hasMore = false;
      for (const row of rows) {
        if (count >= s.rowLimit) {
          hasMore = true;
          break;
        }
        count++;
        const { node, edge } = row,
          isOpen = s.expanded.has(row.path) || Boolean(s.filter);
        const expander = row.hasChildren
          ? el(
              "button",
              {
                class: "expand-btn",
                "aria-label": (isOpen ? "折叠 " : "展开 ") + node.name,
                "aria-expanded": String(isOpen),
                ...(s.filter
                  ? { disabled: "", title: "筛选模式自动展开匹配路径" }
                  : {}),
                onclick: (event) => {
                  event.stopPropagation();
                  if (s.filter) {
                    document.getElementById("announcement").textContent =
                      "搜索模式自动展开相关路径，清除筛选后可手动折叠。";
                    return;
                  }
                  if (s.expanded.has(row.path)) s.expanded.delete(row.path);
                  else s.expanded.add(row.path);
                  app.renderView();
                },
              },
              icon(isOpen ? "chevron-down" : "chevron-right"),
            )
          : el("span", { class: "expand-spacer" });
        const selected =
          s.selectedId === node.id &&
          (!s.selectedEdge || edge?.id === s.selectedEdge);
        const name = el(
          "div",
          {
            class: "dependency-name",
            style: "--depth:" + Math.min(row.depth, 12),
          },
          row.depth
            ? el("span", { class: "branch-line", "aria-hidden": "true" })
            : null,
          expander,
          el(
            "span",
            { class: "node-icon" },
            icon(
              node.kind === "root" || node.kind === "project"
                ? "folder"
                : node.kind === "file"
                  ? "file"
                  : "cube",
            ),
          ),
          el(
            "span",
            { class: "node-label" },
            el(
              "span",
              { class: "node-copy" },
              el(
                "span",
                { class: "coordinate", title: node.coordinate },
                node.kind === "module" || node.kind === "platform"
                  ? node.group + ":" + node.name
                  : node.name,
              ),
            ),
            edge?.constraint
              ? el("span", { class: "type-label" }, "约束")
              : typeLabel(node)
                ? el("span", { class: "type-label" }, typeLabel(node))
                : null,
            row.cycle ? el("span", { class: "cycle-text" }, "循环引用") : null,
          ),
        );
        const requested =
          edge?.requested.version ||
          (edge?.requested.versionConstraint?.strict
            ? "严格 " + edge.requested.versionConstraint.strict
            : edge?.requested.kind === "module"
              ? "由约束确定"
              : "—");
        const item = el(
          "div",
          {
            class: "tree-row" + (selected ? " selected" : ""),
            role: "treeitem",
            tabindex: 0,
            "aria-level": row.depth + 1,
            "aria-selected": String(selected),
            ...(row.hasChildren ? { "aria-expanded": String(isOpen) } : {}),
            "data-node": node.id,
            "data-path": row.path,
            onclick: () => app.select(node.id, edge?.id),
            onkeydown: (event) => {
              if (event.target !== item) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                app.select(node.id, edge?.id);
              }
              if (
                (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
                row.hasChildren &&
                !s.filter
              ) {
                event.preventDefault();
                if (event.key === "ArrowRight") s.expanded.add(row.path);
                else s.expanded.delete(row.path);
                app.renderView();
                document
                  .querySelector('[data-path="' + CSS.escape(row.path) + '"]')
                  ?.focus();
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const all = [...host.querySelectorAll(".tree-row")],
                  n = all.indexOf(item) + (event.key === "ArrowDown" ? 1 : -1);
                all[n]?.focus();
              }
            },
          },
          name,
          el(
            "span",
            { class: "request-version", title: String(requested) },
            requested,
          ),
          el(
            "span",
            {
              class: "selected-version" + (!node.resolved ? " error-text" : ""),
            },
            el(
              "span",
              {},
              node.kind === "root"
                ? "—"
                : node.version || (node.resolved ? "—" : "未解析"),
            ),
            edge && changeLabel(edge)
              ? el("span", { class: "change-label" }, changeLabel(edge))
              : null,
          ),
        );
        list.append(item);
      }
      host.replaceChildren(header, list);
      if (count <= 1 && s.filter)
        host.append(
          empty(
            "没有匹配的依赖",
            "试试依赖名称、group 或版本号，也可以清除“仅看版本变化”筛选。",
            "search",
          ),
        );
      if (hasMore)
        host.append(
          el(
            "button",
            {
              class: "load-more",
              onclick: () => {
                s.rowLimit += 500;
                app.renderView();
              },
            },
            "继续显示更多依赖（每次 500 行）",
          ),
        );
      host.scrollTop = scroll;
    },
  };
})();

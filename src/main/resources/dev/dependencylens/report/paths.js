(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs = {}, ...children) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    for (const c of children)
      n.append(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
  function route(points) {
    if (points.length < 2) return "";
    let result = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i],
        next = points[i + 1];
      result += ` Q${p.x},${p.y} ${(p.x + next.x) / 2},${(p.y + next.y) / 2}`;
    }
    const last = points[points.length - 1];
    return result + ` L${last.x},${last.y}`;
  }
  function layout(data, idx, selected) {
    const ancestor = window.LensModel.ancestors(idx, [selected]),
      primary = new dagre.graphlib.Graph({ multigraph: true }),
      children = new dagre.graphlib.Graph({ multigraph: true });
    for (const graph of [primary, children]) {
      graph.setDefaultEdgeLabel(() => ({}));
      graph.setGraph({
        rankdir: graph === primary ? "LR" : "TB",
        ranksep: 55,
        nodesep: 50,
        edgesep: 16,
        marginx: 20,
        marginy: 20,
      });
    }
    for (const n of data.nodes) {
      const shape = {
        width: n.id === idx.root ? 85 : 205,
        height: n.id === idx.root ? 48 : 86,
      };
      (ancestor.has(n.id) ? primary : children).setNode(n.id, shape);
    }
    const selectedShape = { width: 205, height: 86 };
    if (data.nodes.some((n) => !ancestor.has(n.id)))
      children.setNode(selected, selectedShape);
    for (const e of data.edges) {
      const target = idx.nodes.get(e.to),
        label =
          e.to === selected
            ? e.requested.version
              ? "请求 " + e.requested.version
              : "依赖请求"
            : e.from === selected
              ? "子依赖"
              : "";
      const info = { width: label ? 95 : 0, height: label ? 20 : 0, label };
      const graph =
        ancestor.has(e.from) && ancestor.has(e.to) ? primary : children;
      if (graph.hasNode(e.from) && graph.hasNode(e.to))
        graph.setEdge(e.from, e.to, info, e.id);
    }
    dagre.layout(primary);
    if (children.nodeCount()) dagre.layout(children);
    const positions = new Map(),
      edgeLayouts = new Map(),
      p = primary.node(selected),
      c = children.node(selected);
    const dx = p && c ? p.x - c.x : 0,
      dy = p && c ? p.y - c.y : 0;
    for (const n of data.nodes) {
      const usePrimary = ancestor.has(n.id),
        g = usePrimary ? primary : children,
        value = g.node(n.id);
      if (value)
        positions.set(n.id, {
          ...value,
          x: value.x + (usePrimary ? 0 : dx),
          y: value.y + (usePrimary ? 0 : dy),
        });
    }
    for (const e of data.edges) {
      const g = ancestor.has(e.from) && ancestor.has(e.to) ? primary : children,
        v = g.edge({ v: e.from, w: e.to, name: e.id });
      if (v)
        edgeLayouts.set(e.id, {
          ...v,
          x: v.x + (g === primary ? 0 : dx),
          y: v.y + (g === primary ? 0 : dy),
          points: v.points.map((p) => ({
            x: p.x + (g === primary ? 0 : dx),
            y: p.y + (g === primary ? 0 : dy),
          })),
        });
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of positions.values()) {
      minX = Math.min(minX, p.x - p.width / 2);
      maxX = Math.max(maxX, p.x + p.width / 2);
      minY = Math.min(minY, p.y - p.height / 2);
      maxY = Math.max(maxY, p.y + p.height / 2);
    }
    return {
      positions,
      edgeLayouts,
      minX,
      minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }
  window.LensPaths = {
    render(app) {
      const { el, icon, empty } = window.LensUI,
        s = app.state,
        host = document.getElementById("paths-view"),
        node = s.idx.nodes.get(s.selectedId);
      if (!node || node.id === s.idx.root) {
        host.replaceChildren(
          empty(
            s.filter && !s.filter.hits.size
              ? "没有匹配的依赖"
              : "选择一个依赖查看路径",
            "先在依赖树中选择依赖，或使用上方搜索定位依赖。",
            "arrows-split",
          ),
        );
        return;
      }
      const data = window.LensModel.pathGraph(
        s.idx,
        node.id,
        s.childExpanded,
        s.pathLimit,
      );
      const crumb = el(
        "div",
        { class: "path-breadcrumb" },
        el("span", {}, s.idx.graph.module),
        el("span", {}, node.name),
      );
      const canvas = el("div", { class: "path-canvas" }),
        sheet = svg("svg", {
          class: "path-svg",
          role: "group",
          "aria-label": node.name + " 的依赖引入路径",
        }),
        group = svg("g");
      const defs = svg("defs");
      for (const [id, color] of [
        ["normal", "#6b83a8"],
        ["changed", "#e88900"],
      ])
        defs.append(
          svg(
            "marker",
            {
              id: "arrow-" + id,
              viewBox: "0 0 10 10",
              refX: 9,
              refY: 5,
              markerWidth: 7,
              markerHeight: 7,
              orient: "auto-start-reverse",
            },
            svg("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: color }),
          ),
        );
      sheet.append(defs, group);
      canvas.append(sheet);
      const controls = el("div", { class: "zoom-controls" }),
        zoomText = el("span", {}, "100%");
      const legend = el(
        "div",
        { class: "graph-legend" },
        el("span", {}, icon("arrow-right"), "依赖方向"),
        el("span", { class: "amber" }, icon("arrow-right"), "请求版本发生变化"),
      );
      const notice = el("div", { class: "graph-notice" });
      if (data.hidden > 0)
        notice.append(
          document.createTextNode(
            "已折叠 " +
              data.hidden +
              " 个相关节点，当前显示 " +
              data.nodes.length +
              " / " +
              data.total +
              "。",
          ),
          el(
            "button",
            {
              onclick: () => {
                s.pathLimit += 200;
                app.renderView();
              },
            },
            "继续展开 200 个",
          ),
        );
      else notice.hidden = true;
      const expand = el(
        "button",
        {
          class: "text-button",
          onclick: () => {
            for (const id of data.children) s.childExpanded.add(id);
            app.renderView();
          },
        },
        "展开一层子依赖",
      );
      const canExpand = [...data.children].some(
        (id) =>
          !s.childExpanded.has(id) &&
          (s.idx.outgoing.get(id) || []).some(
            (e) => !e.constraint && !data.nodes.some((x) => x.id === e.to),
          ),
      );
      expand.hidden = !canExpand;
      host.replaceChildren(
        crumb,
        notice,
        canvas,
        el("div", { class: "path-actions" }, controls, expand, legend),
      );
      const placed = layout(data, s.idx, node.id);
      for (const edge of data.edges) {
        const v = placed.edgeLayouts.get(edge.id);
        if (!v) continue;
        const changed = window.LensModel.changed(edge);
        const path = svg("path", {
          d: route(v.points),
          class: "graph-edge" + (changed ? " changed" : ""),
          "marker-end": "url(#arrow-" + (changed ? "changed" : "normal") + ")",
        });
        path.append(svg("title", {}, edge.requested.display));
        group.append(path);
        if (v.label) {
          const bg = svg("rect", {
            x: v.x - 49,
            y: v.y - 11,
            width: 98,
            height: 22,
            rx: 3,
            fill: changed ? "#fff5e5" : "#ffffff",
          });
          const label = svg(
            "text",
            {
              x: v.x,
              y: v.y + 3,
              "text-anchor": "middle",
              class: "graph-edge-label" + (changed ? " changed" : ""),
            },
            v.label,
          );
          group.append(bg, label);
        }
      }
      for (const n of data.nodes) {
        const p = placed.positions.get(n.id);
        if (!p) continue;
        const x = p.x - p.width / 2,
          y = p.y - p.height / 2;
        const element = svg("g", {
          class: "graph-node" + (n.id === node.id ? " selected" : ""),
          transform: `translate(${x},${y})`,
          tabindex: 0,
          role: "button",
          "aria-label": n.coordinate,
          "data-graph-node": n.id,
        });
        element.append(
          svg("title", {}, n.coordinate),
          svg("rect", { width: p.width, height: p.height, rx: 4 }),
        );
        if (n.id === s.idx.root)
          element.append(
            svg(
              "text",
              {
                x: p.width / 2,
                y: 29,
                "text-anchor": "middle",
                class: "graph-name",
              },
              n.name,
            ),
          );
        else {
          element.append(
            svg(
              "text",
              { x: 15, y: 22, class: "graph-group" },
              short(
                n.group ||
                  (n.kind === "project"
                    ? "项目依赖"
                    : n.kind === "file"
                      ? "本地文件"
                      : "组件"),
                29,
              ),
            ),
            svg(
              "text",
              { x: 15, y: 44, class: "graph-name" },
              short(n.name, 25),
            ),
            svg(
              "text",
              { x: 15, y: 68, class: "graph-version" },
              n.version || (n.resolved ? "—" : "未解析"),
            ),
          );
          if (n.id === node.id)
            element.append(
              svg(
                "text",
                {
                  x: p.width - 11,
                  y: 65,
                  "text-anchor": "end",
                  class: "selected-tag",
                },
                "最终解析",
              ),
            );
        }
        element.addEventListener("click", () => app.select(n.id));
        element.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            app.select(n.id);
          }
        });
        group.append(element);
      }
      let scale = 1,
        tx = 0,
        ty = 0,
        drag = null;
      const update = () => {
        group.setAttribute(
          "transform",
          `translate(${tx},${ty}) scale(${scale})`,
        );
        zoomText.textContent = Math.round(scale * 100) + "%";
      };
      const fit = () => {
        const w = canvas.clientWidth,
          h = canvas.clientHeight;
        sheet.setAttribute("viewBox", `0 0 ${w} ${h}`);
        scale = Math.min(
          (w - 52) / placed.width,
          (h - 44) / placed.height,
          1.1,
        );
        scale = Math.max(0.05, scale);
        tx = (w - placed.width * scale) / 2 - placed.minX * scale;
        ty = (h - placed.height * scale) / 2 - placed.minY * scale;
        update();
      };
      const zoom = (factor) => {
        const old = scale;
        scale = Math.max(0.05, Math.min(3, scale * factor));
        const cx = canvas.clientWidth / 2,
          cy = canvas.clientHeight / 2;
        tx = cx - ((cx - tx) * scale) / old;
        ty = cy - ((cy - ty) * scale) / old;
        update();
      };
      controls.append(
        el(
          "button",
          {
            class: "icon-btn",
            "aria-label": "缩小路径图",
            onclick: () => zoom(1 / 1.2),
          },
          icon("minus"),
        ),
        zoomText,
        el(
          "button",
          {
            class: "icon-btn",
            "aria-label": "放大路径图",
            onclick: () => zoom(1.2),
          },
          icon("plus"),
        ),
        el("button", { class: "text-button", onclick: fit }, "适应画布"),
      );
      canvas.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
        },
        { passive: false },
      );
      canvas.addEventListener("pointerdown", (e) => {
        if (e.target.closest(".graph-node")) return;
        drag = { x: e.clientX, y: e.clientY, tx, ty };
        canvas.setPointerCapture(e.pointerId);
        canvas.classList.add("dragging");
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!drag) return;
        tx = drag.tx + e.clientX - drag.x;
        ty = drag.ty + e.clientY - drag.y;
        update();
      });
      const end = () => {
        drag = null;
        canvas.classList.remove("dragging");
      };
      canvas.addEventListener("pointerup", end);
      canvas.addEventListener("pointercancel", end);
      fit();
    },
  };
})();

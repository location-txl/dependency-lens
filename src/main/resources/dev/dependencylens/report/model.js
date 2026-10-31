/* Pure graph operations shared by the tree, inspector and paths views. */
(function (global) {
  "use strict";
  const changed = (edge) =>
    edge.changeKind === "version" || edge.changeKind === "substitution";
  function index(graph) {
    const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    const outgoing = new Map(),
      incoming = new Map(),
      edgeById = new Map();
    for (const edge of graph.edges) {
      if (!nodes.has(edge.from) || !nodes.has(edge.to)) continue;
      if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
      if (!incoming.has(edge.to)) incoming.set(edge.to, []);
      outgoing.get(edge.from).push(edge);
      incoming.get(edge.to).push(edge);
      edgeById.set(edge.id, edge);
    }
    const root = graph.rootId;
    const reachable = new Set([root]),
      queue = [root],
      parent = new Map();
    for (let i = 0; i < queue.length; i++)
      for (const edge of outgoing.get(queue[i]) || []) {
        if (!edge.constraint && !reachable.has(edge.to)) {
          reachable.add(edge.to);
          queue.push(edge.to);
          parent.set(edge.to, edge);
        }
      }
    return {
      graph,
      nodes,
      outgoing,
      incoming,
      edgeById,
      root,
      reachable,
      parent,
    };
  }
  function stats(idx) {
    const direct = new Set(),
      transitive = new Set(),
      changes = new Set();
    for (const edge of idx.outgoing.get(idx.root) || [])
      if (!edge.constraint) direct.add(idx.nodes.get(edge.to).componentId);
    for (const id of idx.reachable)
      if (id !== idx.root) {
        const component = idx.nodes.get(id).componentId;
        if (!direct.has(component)) transitive.add(component);
      }
    for (const edge of idx.graph.edges)
      if (!edge.constraint && changed(edge))
        changes.add(idx.nodes.get(edge.to).componentId);
    return {
      direct: direct.size,
      transitive: transitive.size,
      changes: changes.size,
    };
  }
  function ancestors(idx, targets) {
    const result = new Set(targets),
      queue = [...result];
    for (let i = 0; i < queue.length; i++)
      for (const edge of idx.incoming.get(queue[i]) || []) {
        if (!edge.constraint && !result.has(edge.from)) {
          result.add(edge.from);
          queue.push(edge.from);
        }
      }
    return result;
  }
  function matches(idx, query, changesOnly) {
    const text = query.trim().toLowerCase();
    if (!text && !changesOnly) return null;
    const hits = new Set();
    for (const [id, node] of idx.nodes) {
      if (id === idx.root) continue;
      const related = idx.incoming.get(id) || [];
      const haystack = [
        node.coordinate,
        node.name,
        node.group,
        ...related.map((e) => e.requested.display),
      ]
        .join(" ")
        .toLowerCase();
      if (
        (!text || haystack.includes(text)) &&
        (!changesOnly || related.some((e) => !e.constraint && changed(e)))
      )
        hits.add(id);
    }
    return { hits, allowed: ancestors(idx, hits) };
  }
  function shortestPath(idx, target) {
    if (target === idx.root) return [];
    if (!idx.parent.has(target)) return null;
    const result = [],
      seen = new Set();
    let id = target;
    while (id !== idx.root && idx.parent.has(id) && !seen.has(id)) {
      seen.add(id);
      const edge = idx.parent.get(id);
      result.push(edge);
      id = edge.from;
    }
    return id === idx.root ? result.reverse() : null;
  }
  function introductionPaths(idx, target) {
    const result = [];
    for (const edge of idx.incoming.get(target) || []) {
      if (edge.constraint) continue;
      const path = shortestPath(idx, edge.from);
      if (path && !path.some((e) => e.to === target))
        result.push([...path, edge]);
    }
    return result;
  }
  function pathGraph(
    idx,
    selected,
    childExpanded = new Set([selected]),
    limit = 200,
  ) {
    const related = ancestors(idx, [selected]);
    const children = new Set([selected]),
      queue = [selected];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (!childExpanded.has(id)) continue;
      for (const edge of idx.outgoing.get(id) || [])
        if (!edge.constraint && !children.has(edge.to)) {
          children.add(edge.to);
          queue.push(edge.to);
        }
    }
    for (const id of children) related.add(id);
    const ordered = [...related];
    // Breadth-first order keeps nearby branches together and makes expansion deterministic.
    const visible = new Set(ordered.slice(0, Math.max(1, limit)));
    const edges = idx.graph.edges.filter(
      (e) => !e.constraint && visible.has(e.from) && visible.has(e.to),
    );
    return {
      nodes: [...visible].map((id) => idx.nodes.get(id)).filter(Boolean),
      edges,
      hidden: related.size - visible.size,
      total: related.size,
      children,
    };
  }
  function* treeRows(idx, expanded, filter) {
    const stack = [{ id: idx.root, path: "root", depth: 0, ancestors: [] }];
    while (stack.length) {
      const row = stack.pop(),
        node = idx.nodes.get(row.id);
      if (
        !node ||
        (filter && row.id !== idx.root && !filter.allowed.has(row.id))
      )
        continue;
      const cycle = row.ancestors.includes(row.id);
      const children = (idx.outgoing.get(row.id) || []).filter(
        (e) => !filter || filter.allowed.has(e.to),
      );
      yield {
        ...row,
        node,
        cycle,
        hasChildren: !cycle && !row.edge?.constraint && children.length > 0,
      };
      if (
        !cycle &&
        !row.edge?.constraint &&
        (expanded.has(row.path) || filter)
      ) {
        for (let i = children.length - 1; i >= 0; i--) {
          const edge = children[i];
          stack.push({
            id: edge.to,
            edge,
            path: row.path + "/" + edge.id,
            depth: row.depth + 1,
            ancestors: [...row.ancestors, row.id],
          });
        }
      }
    }
  }
  const model = {
    index,
    stats,
    changed,
    ancestors,
    matches,
    shortestPath,
    introductionPaths,
    pathGraph,
    treeRows,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  global.LensModel = model;
})(typeof window === "undefined" ? globalThis : window);

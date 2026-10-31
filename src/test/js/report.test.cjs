const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../../main/resources/dev/dependencylens/report/model.js");
const n = (id, componentId = id) => ({
  id,
  componentId,
  name: id,
  coordinate: id,
  kind: "module",
  resolved: true,
});
const e = (id, from, to, changeKind = "none", constraint = false) => ({
  id,
  from,
  to,
  changeKind,
  constraint,
  requested: { display: to },
});
function fixture() {
  return M.index({
    rootId: "root",
    nodes: ["root", "a", "b", "c", "leaf", "platform"].map((x) => n(x)),
    edges: [
      e("a", "root", "a"),
      e("b", "root", "b"),
      e("ac", "a", "c", "version"),
      e("bc", "b", "c"),
      e("cl", "c", "leaf"),
      e("p", "root", "platform"),
      e("pc", "platform", "c", "constraint", true),
    ],
  });
}
test("shared nodes keep every incoming request and constraints do not become introduction paths", () => {
  const idx = fixture(),
    paths = M.introductionPaths(idx, "c");
  assert.equal(paths.length, 2);
  assert.deepEqual(
    paths.map((p) => p.map((e) => e.id)),
    [
      ["a", "ac"],
      ["b", "bc"],
    ],
  );
  assert.deepEqual(M.stats(idx), { direct: 3, transitive: 2, changes: 1 });
});
test("search and change filter retain all ordinary ancestors", () => {
  const idx = fixture(),
    f = M.matches(idx, "c", true);
  assert(f.hits.has("c"));
  for (const id of ["root", "a", "b", "c"]) assert(f.allowed.has(id));
  assert(!f.allowed.has("platform"));
  assert(!f.allowed.has("leaf"));
});
test("paths merge a diamond, expose children and omit constraint edges", () => {
  const idx = fixture(),
    g = M.pathGraph(idx, "c");
  assert.equal(g.nodes.length, 5);
  assert.equal(g.edges.length, 5);
  assert(!g.edges.some((e) => e.constraint));
  assert.equal(g.nodes.filter((n) => n.id === "c").length, 1);
});
test("expanding descendants never pulls unrelated children of ancestors into the path view", () => {
  const idx = fixture();
  idx.graph.nodes.push(n("grandchild"));
  idx.graph.edges.push(e("lg", "leaf", "grandchild"));
  const graph = M.index(idx.graph);
  const first = M.pathGraph(graph, "c");
  const second = M.pathGraph(graph, "c", new Set(first.children));
  assert(second.nodes.some((n) => n.id === "grandchild"));
  assert(!second.nodes.some((n) => n.id === "platform"));
  assert(!second.children.has("root"));
});
test("tree repeats shared dependencies by path but terminates cycles", () => {
  const idx = fixture();
  idx.graph.edges.push(e("cycle", "leaf", "a"));
  const cyc = M.index(idx.graph),
    rows = [
      ...M.treeRows(cyc, new Set(), { allowed: new Set(cyc.nodes.keys()) }),
    ];
  assert(rows.some((r) => r.cycle));
  assert(rows.length < 30);
  assert(rows.filter((r) => r.id === "c").length >= 2);
});
test("direct classification wins over transitive and selected variants share component statistics", () => {
  const idx = M.index({
    rootId: "root",
    nodes: [n("root"), n("a"), n("v1", "shared"), n("v2", "shared")],
    edges: [e("a", "root", "a"), e("v1", "root", "v1"), e("v2", "a", "v2")],
  });
  assert.deepEqual(M.stats(idx), { direct: 2, transitive: 0, changes: 0 });
});
test("dynamic and managed version requests are not counted as version conflicts", () => {
  const idx = M.index({
    rootId: "root",
    nodes: [n("root"), n("dynamic"), n("managed")],
    edges: [
      e("d", "root", "dynamic", "dynamic"),
      e("m", "root", "managed", "managed"),
    ],
  });
  assert.equal(M.stats(idx).changes, 0);
  assert.equal(M.matches(idx, "", true).hits.size, 0);
});
test("a 10,000-node graph is indexed and traversed without enumerating complete paths", () => {
  const nodes = [n("root")],
    edges = [];
  for (let i = 0; i < 10000; i++) {
    nodes.push(n("n" + i));
    edges.push(e("e" + i, i ? "n" + (i - 1) : "root", "n" + i));
    if (i > 1) edges.push(e("x" + i, "n" + (i - 2), "n" + i));
  }
  const idx = M.index({ rootId: "root", nodes, edges });
  const view = M.pathGraph(idx, "n9999", new Set(), 200);
  assert.equal(view.nodes.length, 200);
  assert.equal(view.hidden, 9801);
  assert.equal(M.pathGraph(idx, "n9999", new Set(), 11000).nodes.length, 10001);
  assert(M.shortestPath(idx, "n9999").length <= 5001);
});
test("tree iterator can stop before materializing a large shared graph", () => {
  const idx = fixture(),
    rows = M.treeRows(idx, new Set(["root"]), null);
  assert.equal([...rows].length, 4);
  assert.equal(M.shortestPath(idx, "missing"), null);
});

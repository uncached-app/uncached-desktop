import test from "node:test";
import assert from "node:assert/strict";
import { relativeManifest, visibleDependencies } from "../src/utils/dependencies.mjs";

const dependency = (name, confidence) => ({
  name,
  confidence,
  kind: "runtime",
  reason: "notReferenced",
  removeWith: `npm uninstall ${name}`,
});

const projects = [
  {
    project: "/w/small",
    unreadable: [],
    reports: [{ manifest: "/w/small/package.json", ecosystem: "node", declared: 3, unused: [dependency("b", "medium")] }],
  },
  {
    project: "/w/big",
    unreadable: [],
    reports: [
      {
        manifest: "/w/big/package.json",
        ecosystem: "node",
        declared: 9,
        unused: [dependency("zod", "high"), dependency("@types/x", "review"), dependency("axios", "high")],
      },
      { manifest: "/w/big/src-tauri/Cargo.toml", ecosystem: "cargo", declared: 4, unused: [] },
    ],
  },
];

test("high confidence drops the doubtful findings and what is left empty", () => {
  const visible = visibleDependencies(projects, "high");
  assert.deepEqual(
    visible.map((project) => [project.project, project.reports.map((report) => report.unused.map((d) => d.name))]),
    [["/w/big", [["axios", "zod"]]]],
  );
});

test("every level keeps them, surest first, and the busiest project leads", () => {
  const visible = visibleDependencies(projects, "all");
  assert.deepEqual(
    visible.map((project) => project.reports.flatMap((report) => report.unused.map((d) => d.name))),
    [["axios", "zod", "@types/x"], ["b"]],
  );
});

test("the input is not reordered or filtered in place", () => {
  visibleDependencies(projects, "high");
  assert.deepEqual(projects[1].reports[0].unused.map((d) => d.name), ["zod", "@types/x", "axios"]);
});

test("a manifest is shown relative to its project, on either separator", () => {
  assert.equal(relativeManifest("/w/big", "/w/big/src-tauri/Cargo.toml"), "src-tauri/Cargo.toml");
  assert.equal(relativeManifest("C:\\w\\big\\", "C:\\w\\big\\package.json"), "package.json");
  assert.equal(relativeManifest("/w/big", "/elsewhere/package.json"), "/elsewhere/package.json");
});

import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const scratch = mkdtempSync(join(tmpdir(), "instrumentaz-model-"));
const source = readFileSync(new URL("../src/lib/instrument-model.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const modulePath = join(scratch, "instrument-model.cjs");
writeFileSync(modulePath, compiled);
const model = createRequire(import.meta.url)(modulePath);
after(() => rmSync(scratch, { recursive: true, force: true }));

test("ideal flexible-string model converts mm and g/m to newtons", () => {
  const tension = model.calculateStringTension(328, 196, 5.4);
  assert.ok(Math.abs(tension - 89.27) < 0.01, `expected about 89.27 N, got ${tension}`);
  assert.equal(model.calculateStringTension(0, 196, 5.4), null);
  assert.equal(model.calculateStringTension(328, 0, 5.4), null);
  assert.equal(model.calculateStringTension(328, 196, Number.NaN), null);
});

test("frequency and tension equations invert one another", () => {
  const expectedHz = 440;
  const tension = model.calculateStringTension(328, expectedHz, 1.55);
  const recoveredHz = model.calculateStringFrequency(328, tension, 1.55);
  assert.ok(Math.abs(recoveredHz - expectedHz) < 1e-10);
});

test("violin assembly and blank Build A–Z templates validate as distinct modes", () => {
  const assembly = model.createDefaultProjectData("assembly");
  const buildFromScratch = model.createDefaultProjectData("build");
  assert.equal(assembly.parts.length, 18);
  assert.equal(assembly.strings.length, 4);
  assert.deepEqual(model.validateProject(assembly), []);
  assert.equal(buildFromScratch.parts.length, 0);
  assert.equal(buildFromScratch.designMode, "build");
});

test("BOM CSV includes component material and quantities", () => {
  const csv = model.createBomCsv(model.createDefaultProjectData("assembly"));
  assert.match(csv, /"Item ID","Component","Category","Material specification","Quantity","Connections"/);
  assert.match(csv, /"top-plate","Top plate","Plate","European spruce","1"/);
});

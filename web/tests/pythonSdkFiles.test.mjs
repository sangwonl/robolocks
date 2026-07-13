import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PYTHON_SDK_FILES } from "../src/hangar/pythonSdkFiles.generated.ts";

const sdkDir = resolve(import.meta.dirname, "../../sdk/python/robolocks");

test("generated python sdk bundle matches sdk/python sources", () => {
  const files = readdirSync(sdkDir).filter((n) => n.endsWith(".py")).sort();
  assert.deepEqual(
    Object.keys(PYTHON_SDK_FILES).sort(),
    files.map((n) => `robolocks/${n}`),
  );
  for (const name of files) {
    assert.equal(PYTHON_SDK_FILES[`robolocks/${name}`], readFileSync(join(sdkDir, name), "utf8"));
  }
});

test("bundle contains the browser registration entrypoints", () => {
  const runtime = PYTHON_SDK_FILES["robolocks/runtime.py"];
  assert.match(runtime, /def call_registered_bot\(/);
  assert.match(runtime, /def clear_registered_bot\(/);
});

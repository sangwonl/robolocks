import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, "..");
const buildDir = resolve(process.env.ROBOLOCKS_WASM_BUILD_DIR ?? join(rootDir, "build-wasm-release"));
const publicWasmDir = resolve(process.env.ROBOLOCKS_WASM_OUT_DIR ?? join(rootDir, "web/public/wasm"));
const generatedDir = resolve(process.env.ROBOLOCKS_WASM_JS_OUT_DIR ?? join(rootDir, "web/src/generated"));

const searchDirs = [
  join(buildDir, "wasm"),
  buildDir,
];

const artifactPattern = /^robolocks_wasm.*\.(js|mjs|wasm|data)$/;
const artifacts = [];

for (const dir of searchDirs) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    continue;
  }

  for (const entry of readdirSync(dir)) {
    if (artifactPattern.test(entry)) {
      artifacts.push({ from: join(dir, entry), name: entry });
    }
  }
}

if (artifacts.length === 0) {
  throw new Error(`No robolocks_wasm artifacts found in ${searchDirs.join(", ")}`);
}

mkdirSync(publicWasmDir, { recursive: true });
mkdirSync(generatedDir, { recursive: true });

for (const artifact of artifacts) {
  const isLoader = artifact.name.endsWith(".js") || artifact.name.endsWith(".mjs");
  const to = join(isLoader ? generatedDir : publicWasmDir, artifact.name);
  copyFileSync(artifact.from, to);
  console.log(`synced ${artifact.from} -> ${to}`);
}

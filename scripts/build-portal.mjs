import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist");

const run = (cmd, cwd, env = {}) => {
  execSync(cmd, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
    shell: true,
  });
};

console.log("→ Building MIX portal…\n");

if (fs.existsSync(out)) fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

console.log("  Landing page");
fs.cpSync(path.join(root, "landing"), out, { recursive: true });

const buildApp = (name, dir, basePath, outSub) => {
  console.log(`\n━━ ${name} (${basePath}) ━━`);
  const appDir = path.join(root, dir);
  console.log("  → npm install …");
  run("npm install", appDir, { VITE_BASE: basePath });
  console.log("  → npm run build …");
  run("npm run build", appDir, { VITE_BASE: basePath });
  console.log(`  ✓ ${name} done\n`);
  fs.cpSync(path.join(appDir, "dist"), path.join(out, outSub), { recursive: true });
};

buildApp("DAW Studio", "daw-studio", "/daw/", "daw");
buildApp("Video Studio", "video-studio", "/video/", "video");

console.log("\n✓ Output: dist/");
console.log("  /       → TOP（スタジオ選択）");
console.log("  /daw/   → MIX DAW");
console.log("  /video/ → MIX Video Studio");

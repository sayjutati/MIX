import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const marker = path.join(dist, "dtm", "index.html");

const hasPortal = fs.existsSync(marker);

if (!hasPortal) {
  console.log("");
  console.log("  dist/ がまだありません（/dtm/ などは build 後に生成されます）");
  console.log("  → 初回のみポータル全体をビルドします…");
  console.log("");
  execSync("npm run build", { cwd: root, stdio: "inherit", shell: true });
}

console.log("");
console.log("  MIX ポータル（ローカル）");
console.log("  ─────────────────────────");
console.log("  TOP   http://localhost:3000/");
console.log("  DTM   http://localhost:3000/dtm/");
console.log("  DAW   http://localhost:3000/daw/");
console.log("  Video http://localhost:3000/video/");
console.log("");
console.log("  ※ DTM をホットリロードで開発 → npm run dev:dtm （:1440）");
console.log("  ※ TOP だけ編集 → npm run dev:landing");
console.log("");

const child = spawn("npx", ["--yes", "serve", "dist", "-l", "3000"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 0));

/**
 * Push / Vercel 前に落とすチェック（Linux CI と同じ前提）
 * - node_modules / dist が Git に入っていない
 * - 各アプリの import が package.json の dependencies にある
 * - 本番ビルドと同じ lockfile がある
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const APPS = [
  { dir: "daw-studio", src: "src" },
  { dir: "video-studio", src: "src" },
];

const TRACKED_DENY = [
  /^node_modules\//,
  /^daw-studio\/node_modules\//,
  /^video-studio\/node_modules\//,
  /^dist\//,
  /^daw-studio\/dist\//,
  /^video-studio\/dist\//,
];

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']/g;

const pkgName = (spec) => {
  if (!spec || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:")) {
    return null;
  }
  if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/");
  return spec.split("/")[0];
};

const fail = (msgs) => {
  console.error("\n✗ verify-repo failed:\n");
  for (const m of msgs) console.error(`  • ${m}`);
  console.error("\n  Fix locally, then:  npm run verify && npm run build\n");
  process.exit(1);
};

const errors = [];

// --- Git: 追跡禁止パス ---
let tracked = [];
try {
  tracked = execSync("git ls-files", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
} catch {
  console.warn("  (skip git checks: not a git repo)");
}

for (const file of tracked) {
  if (TRACKED_DENY.some((re) => re.test(file))) {
    errors.push(`Git にコミット禁止: ${file}`);
  }
}

// --- 各アプリ: lockfile + 依存 ---
for (const { dir, src } of APPS) {
  const appRoot = path.join(root, dir);
  const pkgPath = path.join(appRoot, "package.json");
  const lockPath = path.join(appRoot, "package-lock.json");

  if (!fs.existsSync(lockPath)) {
    errors.push(`${dir}: package-lock.json がありません（npm install してコミット）`);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);

  const srcRoot = path.join(appRoot, src);
  const files = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) files.push(p);
    }
  };
  walk(srcRoot);

  const used = new Set();
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT_RE)) {
      const name = pkgName(m[1]);
      if (name) used.add(name);
    }
  }

  for (const name of used) {
    if (!declared.has(name)) {
      errors.push(
        `${dir}: import "${name}" があるが package.json に未登録 → npm install ${name} -w ${dir} 相当で dependencies に追加`,
      );
    }
  }
}

if (errors.length) fail(errors);

console.log("✓ verify-repo OK (tracked paths, lockfiles, import ↔ dependencies)");

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Verifies the *built* output in dist/ can be consumed as an ESM module before
 * publishing. This intentionally shells out to a real `node` process instead of
 * importing through vitest: vitest/esbuild tolerate extensionless and directory
 * imports, CJS named imports, and type-only side effects that Node's native ESM
 * loader rejects. Only a real Node process exercises the resolution a published
 * consumer actually hits.
 */

const root = fileURLToPath(new URL("../../", import.meta.url));
const distDir = join(root, "dist");
// TypeScript's JS entry — run it with `node` directly so the build is
// cross-platform (the .bin/tsc.cmd shim can't be spawned without a shell).
const tscEntry = join(root, "node_modules", "typescript", "bin", "tsc");

describe("built ESM package consumption", () => {
  beforeAll(() => {
    // Build fresh so the test always reflects the current source. Run tsc
    // directly (not `npm run build`) so the invocation is shell-free.
    rmSync(distDir, { recursive: true, force: true });
    execFileSync(process.execPath, [tscEntry, "-p", "tsconfig.build.json"], {
      cwd: root,
      stdio: "inherit",
    });
  }, 120_000);

  it("imports the published package by name under real Node ESM", () => {
    // Self-reference (`@dopry/pecans` from its own root) resolves through the
    // package.json "exports" map — the exact path a published consumer takes.
    const script = [
      "const m = await import('@dopry/pecans');",
      "const need = ['Pecans','PecansGitHubBackend','Backend','ReleaseService','configure','main'];",
      "const missing = need.filter((k) => typeof m[k] === 'undefined');",
      "if (missing.length) { console.error('MISSING:' + missing.join(',')); process.exit(2); }",
      "console.log('ESM_CONSUMPTION_OK');",
    ].join("\n");

    let out: string;
    try {
      out = execFileSync(
        process.execPath,
        ["--input-type=module", "-e", script],
        { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      );
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      throw new Error(
        `Built ESM package failed to load under Node:\n${e.stderr ?? ""}${
          e.stdout ?? ""
        }`,
        { cause: err },
      );
    }
    expect(out).toContain("ESM_CONSUMPTION_OK");
  });

  it("emits no empty side-effect imports in dist/ (all-type import footgun)", () => {
    // `import { type X } from 'pkg'` on an all-type import emits
    // `import {} from 'pkg'`, which can break at runtime (e.g. types-only
    // packages). Such imports must use statement-level `import type`.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith(".js")) {
          readFileSync(p, "utf8")
            .split("\n")
            .forEach((line, i) => {
              if (/^\s*import\s*\{\s*\}\s*from\s*['"]/.test(line)) {
                offenders.push(`${p}:${i + 1} ${line.trim()}`);
              }
            });
        }
      }
    };
    walk(distDir);
    expect(offenders).toEqual([]);
  });
});

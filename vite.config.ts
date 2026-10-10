// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { spawnSync } from "node:child_process";
import { getHeapStatistics } from "node:v8";

// The publish pipeline runs plain `vite build` (ignoring package.json NODE_OPTIONS), and the
// Nitro bundling step needs more than Node's default heap. Re-run the build once with a bigger heap.
if (
  process.argv.includes("build") &&
  !process.env.BM_BUILD_RESPAWNED &&
  getHeapStatistics().heap_size_limit < 6 * 1024 ** 3
) {
  const r = spawnSync(process.execPath, ["--max-old-space-size=8192", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, BM_BUILD_RESPAWNED: "1" },
  });
  process.exit(r.status ?? 1);
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
// Build memory: the publish build runs `vite build` without our NODE_OPTIONS, so keep
// sourcemaps off, skip gzip reporting and limit parallel file ops to avoid heap OOM.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      sourcemap: false,
      reportCompressedSize: false,
      rollupOptions: { maxParallelFileOps: 2 },
    },
  },
});

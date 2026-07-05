import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version?: string };
const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
  process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) ??
  process.env.GITHUB_SHA?.slice(0, 12) ??
  process.env.BUILD_ID ??
  "local";

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version ?? "0.0.0"),
    __BUILD_ID__: JSON.stringify(buildId),
  },
});

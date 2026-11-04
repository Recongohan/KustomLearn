import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite ships WASM and data files that must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite", "quickjs-emscripten-core", "@jitl/quickjs-singlefile-mjs-release-sync"],
  // Pyodide is read from disk at runtime (the Python sandbox and the /pyodide route), so the trace can't see it.
  outputFileTracingIncludes: { "/**": ["./node_modules/pyodide/*.{mjs,wasm,zip,json}"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

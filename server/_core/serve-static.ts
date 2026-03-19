/**
 * serve-static.ts
 *
 * Production-only static file serving. This file has ZERO imports from vite
 * or any other devDependency. It is used as the production entry point so
 * that the esbuild bundle does not reference vite plugins.
 */
import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // In the production bundle, dist/index.js is at /app/dist/index.js
  // and the Vite frontend is at /app/dist/public/
  // import.meta.dirname resolves to /app/dist at runtime.
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    console.error(
      `[serveStatic] Build directory not found: ${distPath}. Run 'pnpm build' first.`
    );
  } else {
    console.log(`[serveStatic] Serving static files from: ${distPath}`);
  }

  app.use(express.static(distPath));

  // SPA fallback: return index.html for all non-API routes
  app.use("*", (_req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Frontend build not found. Run pnpm build.");
    }
  });
}

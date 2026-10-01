import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import type { Plugin } from "vite";

import { allFontFiles, fontPath } from "./fonts.ts";

const require = createRequire(import.meta.url);

const files = new Map(
  allFontFiles().map((file) => [
    file.name,
    require.resolve(`@fontsource-variable/${file.font}/files/${file.name}`),
  ]),
);

/**
 * Serves every theme font under `/_fonts/`, from its Fontsource package: in
 * development from the dev server, and in a build as static assets of the
 * client output, which Cloudflare serves without running the Worker.
 */
export const themeFonts = (): Plugin => {
  let building = false;
  return {
    name: "pakshi:theme-fonts",
    configResolved(config) {
      building = config.command === "build";
    },
    configureServer(server) {
      server.middlewares.use(fontPath, (request, response, next) => {
        const source = files.get((request.url ?? "").slice(1).split("?")[0] ?? "");
        if (source === undefined) return next();
        response.setHeader("content-type", "font/woff2");
        createReadStream(source).pipe(response);
      });
    },
    async buildStart() {
      if (!building || this.environment.name !== "client") return;
      for (const [name, source] of files)
        this.emitFile({
          type: "asset",
          fileName: `${fontPath.slice(1)}${name}`,
          source: await readFile(source),
        });
    },
  };
};

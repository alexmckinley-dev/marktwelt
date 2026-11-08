import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { handle, warmUp } from "./server/api.ts";

// Im Dev-Betrieb läuft die API als Middleware im Vite-Server: ein Prozess, ein Port.
const api: Plugin = {
  name: "marktwelt-api",
  configureServer(server) {
    warmUp();
    server.middlewares.use((req, res, next) => {
      handle(req, res).then((done) => (done ? undefined : next()), next);
    });
  },
};

export default defineConfig({
  plugins: [react(), api],
  server: { port: 5190, host: "127.0.0.1" },
  build: { chunkSizeWarningLimit: 2000 },
});

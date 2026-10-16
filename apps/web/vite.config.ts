import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { dayTheme } from "./day-theme";
import { palette } from "./day-palette";
import { gmPreload } from "./gm-preload-plugin";

// 端口从环境变量读（默认 5300 / 3029），人机、界面要另起一套服务时用 WEB_PORT、SERVER_PORT 改。
const webPort = Number(process.env.WEB_PORT ?? 5300);
const serverTarget = `http://localhost:${process.env.SERVER_PORT ?? 3029}`;

export default defineConfig({
  // 部署在子路径时用 BASE_PATH 指定，例如 BASE_PATH=/piratebid/ npm run build。
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), dayTheme(palette), gmPreload()],
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      "/socket.io": { target: serverTarget, ws: true },
      "/health": serverTarget
    }
  }
});

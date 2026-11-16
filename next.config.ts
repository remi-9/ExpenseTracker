import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Background music is optional: drop your own file here and restart (see README → Sound).
const MUSIC = "/audio/pokemon-center.mp3";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_MUSIC_SRC: existsSync(`public${MUSIC}`) ? MUSIC : "" },
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

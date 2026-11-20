// What a phone reads when the app is added to its home screen.
import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: "Tracker",
    description: "A personal expense tracker that plays like a handheld RPG.",
    start_url: "/",
    // Opens in the browser as before: the emailed login link opens there, so a separate app window could not use it.
    display: "browser",
    background_color: "#dbe6c8",
    theme_color: "#dbe6c8",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png" },
      { src: "/icon/512", sizes: "512x512", type: "image/png" },
    ],
  };
}

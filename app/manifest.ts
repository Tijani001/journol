import type { MetadataRoute } from "next";

/** Lets Journol be installed as an app on phones and computers. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Journol",
    short_name: "Journol",
    description: "Find new angles and leads in stories that are already published.",
    start_url: "/?source=app",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#5b5bc7",
    categories: ["news", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My stories", url: "/stories", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My angles", url: "/angles", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}

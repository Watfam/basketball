import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hardwood Lab",
    short_name: "Hardwood Lab",
    description: "Player and coach development app",
    start_url: "/",
    display: "standalone",
    background_color: "#0a1120",
    theme_color: "#0a1120",
    icons: [
      { src: "/app-icon", sizes: "512x512", type: "image/png" },
      { src: "/app-icon", sizes: "192x192", type: "image/png" },
    ],
  };
}

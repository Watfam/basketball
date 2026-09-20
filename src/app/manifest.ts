import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hardwood Lab",
    short_name: "Hardwood Lab",
    description: "Player and coach development app",
    start_url: "/",
    display: "standalone",
    background_color: "#f2efe9",
    theme_color: "#f2efe9",
    icons: [
      { src: "/app-icon", sizes: "512x512", type: "image/png" },
      { src: "/app-icon", sizes: "192x192", type: "image/png" },
    ],
  };
}

import type { MetadataRoute } from "next";

// "Add to Home Screen" / "Install app": a Capture icon that opens straight
// to phone capture, full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Formation Pathways Capture",
    short_name: "Capture",
    description: "Capture a formation moment for a Pacifica student.",
    start_url: "/capture",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#16324f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

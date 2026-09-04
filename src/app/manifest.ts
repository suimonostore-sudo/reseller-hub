import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reseller Hub",
    short_name: "RH",
    description: "Track reseller inventory, listings and sales.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#111111",
    orientation: "portrait-primary",
    categories: ["business", "productivity"]
  };
}

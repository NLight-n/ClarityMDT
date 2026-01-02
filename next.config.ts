import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Enable standalone output for Docker
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Fix for PDFKit font loading in serverless environments
      config.externals = [...(config.externals || []), "canvas", "jsdom"];
    }
    return config;
  },
  // Ensure PDFKit is treated as an external package
  serverExternalPackages: ["pdfkit"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;


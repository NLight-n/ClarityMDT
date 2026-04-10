import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Enable standalone output for Docker
  eslint: {
    // Avoid Windows spawn EPERM during `next build`; lint is run separately in CI/dev.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Avoid Windows spawn EPERM during `next build`; typecheck is run separately in CI/dev.
    ignoreBuildErrors: true,
  },
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
  // HIPAA Compliance: Security Headers
  // These headers protect against common web vulnerabilities
  async rewrites() {
    return [
      // OHIF viewer static asset rewrites
      // The OHIF build uses publicPath='/' but we serve it under /ohif-viewer/
      // These rewrites map root-level asset requests to the correct location
      {
        source: "/app-config.js",
        destination: "/ohif-viewer/app-config.js",
      },
      {
        source: "/app.bundle.css",
        destination: "/ohif-viewer/app.bundle.css",
      },
      {
        source: "/init-service-worker.js",
        destination: "/ohif-viewer/init-service-worker.js",
      },
      {
        source: "/sw.js",
        destination: "/ohif-viewer/sw.js",
      },
      {
        source: "/manifest.json",
        destination: "/ohif-viewer/manifest.json",
      },
      // JS bundles (numbered chunks and named bundles)
      {
        source: "/:path(.*bundle.*.js)",
        destination: "/ohif-viewer/:path",
      },
      // CSS files (numbered chunks like /3343.css, /5802.css)
      {
        source: "/:path*.css",
        destination: "/ohif-viewer/:path*.css",
      },
      // SPA fallback for OHIF routes
      {
        source: "/ohif-viewer/viewer",
        destination: "/ohif-viewer/index.html",
      },
      {
        source: "/ohif-viewer/viewer/:path*",
        destination: "/ohif-viewer/index.html",
      },
      // WASM files
      {
        source: "/:path(.*.wasm)",
        destination: "/ohif-viewer/:path",
      },
      // Font files
      {
        source: "/:path(.*.woff2)",
        destination: "/ohif-viewer/:path",
      },
      {
        source: "/:path(.*.woff)",
        destination: "/ohif-viewer/:path",
      },
      // Specific JS files that OHIF loads from root
      {
        source: "/es6-shim.min.js",
        destination: "/ohif-viewer/es6-shim.min.js",
      },
      {
        source: "/polyfill.min.js",
        destination: "/ohif-viewer/polyfill.min.js",
      },
      {
        source: "/oidc-client.min.js",
        destination: "/ohif-viewer/oidc-client.min.js",
      },
      {
        source: "/google.js",
        destination: "/ohif-viewer/google.js",
      },
      {
        source: "/serve.json",
        destination: "/ohif-viewer/serve.json",
      },
      {
        source: "/silent-refresh.html",
        destination: "/ohif-viewer/silent-refresh.html",
      },
      // Assets directory (icons, images)
      {
        source: "/assets/:path*",
        destination: "/ohif-viewer/assets/:path*",
      },
      // DICOM microscopy viewer assets
      {
        source: "/dicom-microscopy-viewer/:path*",
        destination: "/ohif-viewer/dicom-microscopy-viewer/:path*",
      },
      // ONNX Runtime assets
      {
        source: "/ort/:path*",
        destination: "/ohif-viewer/ort/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/:path*",
        headers: [
          {
            // Prevent clickjacking attacks
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            // Prevent MIME type sniffing
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // Enable XSS filter (legacy browsers)
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            // Control referrer information
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // Prevent browser features that might leak PHI
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            // Content Security Policy - adjust as needed for your CDN/resources
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://storage.googleapis.com", // Required for Next.js + OHIF workers + WASM + workbox CDN
              "style-src 'self' 'unsafe-inline'", // Required for inline styles
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https: http://localhost:* http://127.0.0.1:* blob:",
              "worker-src 'self' blob:", // Required for OHIF web workers
              "frame-src 'self' blob:", // Required for PDF/Office preview
              "object-src 'self' blob:", // Required for PDF object preview
              "frame-ancestors 'self'",
              "form-action 'self'",
              "base-uri 'self'",
            ].join("; "),
          },
        ],
      },
      {
        // Additional headers for API routes
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;


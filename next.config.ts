import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "mammoth", "pdfkit", "@resvg/resvg-js"],
  outputFileTracingIncludes: { "/api/**": ["./public/fonts/DocuMindSans.ttf"] },
};

export default nextConfig;

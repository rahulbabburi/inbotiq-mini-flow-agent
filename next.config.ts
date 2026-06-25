import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ensure Gemini SDK runs only on server
  serverExternalPackages: ["@google/generative-ai"],
  devIndicators: false,
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Default request body cap (10MB) is too small for real GP reporting
  // packages - the sample "QIR with Tear Sheets" combined PDFs run well
  // past that. Raised to 50MB for the batch upload flow.
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;

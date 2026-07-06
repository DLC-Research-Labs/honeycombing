import type { NextConfig } from "next";

// The app serves under this sub-path everywhere: proxied at
// dalovecompany.com/honeycombing and standalone on the Vercel deployment.
const basePath = "/honeycombing";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["100.82.203.40"],
  basePath,
  // Inlined at build time so runtime fetch URLs can resolve under basePath
  // (next/link handles its own prefixing; raw fetch() does not).
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: basePath,
        basePath: false,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;

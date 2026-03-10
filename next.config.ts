import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: '/buy', destination: '/apply', permanent: true },
      { source: '/orders/new', destination: '/apply', permanent: true },
    ]
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "kaitorisquare",
  project: "javascript-nextjs",
});

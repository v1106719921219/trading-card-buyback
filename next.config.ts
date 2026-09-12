import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (publicKey) {
  let safe = publicKey.startsWith('sb_publishable_')
  try {
    safe ||= JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()).role === 'anon'
  } catch { /* Non-JWT keys must use the publishable prefix. */ }
  if (!safe) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY must be an anon or publishable key')
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: "kaitorisquare",
  project: "javascript-nextjs",
});

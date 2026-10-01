import type { NextConfig } from "next";

const isVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  // `standalone` solo para Docker (apps/web/Dockerfile runner).
  // En Vercel rompe el build (next-server.js.nft.json), asi que se omite.
  ...(isVercel ? {} : { output: "standalone" }),
};

export default nextConfig;

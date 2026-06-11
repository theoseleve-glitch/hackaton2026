/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root — a stray lockfile in the home dir otherwise misleads
  // Next's root inference and breaks output file tracing.
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react"],
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { isServer }) {
    if (isServer) {
      config.externals = [...(config.externals || []), { 'node:sqlite': 'commonjs node:sqlite' }];
    }
    return config;
  },
};
export default nextConfig;

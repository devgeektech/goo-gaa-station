/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@delivereats/shared-types', '@delivereats/shared-constants'],
  reactStrictMode: true,
};

module.exports = nextConfig;

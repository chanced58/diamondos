/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@baseball/shared', '@baseball/database', '@baseball/ui'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

module.exports = nextConfig;

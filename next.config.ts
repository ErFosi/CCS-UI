import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  output: 'standalone', // Enables standalone output for optimized Docker builds
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  serverActions: {
    bodySizeLimit: '50mb', // Increase body size limit for Server Actions
  },
};

export default nextConfig;

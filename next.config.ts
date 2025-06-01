
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
  // serverActions: { // Removed this block as it causes "Unrecognized key(s)" error
  //   bodySizeLimit: '50mb', 
  // },
};

export default nextConfig;

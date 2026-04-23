import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3', 'sherpa-onnx-node', 'electron'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        child_process: false,
      };
      config.externals = config.externals || [];
      // Leave require('electron') as CommonJS require for Electron renderer
      config.externals.push('commonjs electron');
    }
    return config;
  },
};

export default nextConfig;


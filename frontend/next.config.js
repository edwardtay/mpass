/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Handle Node.js modules that aren't available in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        readline: false,
        child_process: false,
        'pino-pretty': false,
        '@react-native-async-storage/async-storage': false,
      };
    }

    // Ignore problematic modules
    config.externals.push('pino-pretty', 'encoding');

    return config;
  },
  // Suppress hydration warnings in dev
  reactStrictMode: false,
};

module.exports = nextConfig;

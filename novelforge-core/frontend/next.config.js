const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  async rewrites() {
    return [
      {
        source: '/api/sillytavern/:path*',
        destination: 'http://localhost:8000/:path*',
      },
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:8001/api/:path*',
      },
    ];
  },
};

module.exports = nextConfig;

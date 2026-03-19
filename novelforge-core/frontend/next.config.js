/** @type {import('next').NextConfig} */
const nextConfig = {
  // 配置代理，用于连接SillyTavern API
  async rewrites() {
    return [
      {
        source: '/api/sillytavern/:path*',
        destination: 'http://localhost:8000/:path*',
      },
    ]
  },
}

module.exports = nextConfig
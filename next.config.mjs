/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    minimumCacheTTL: 2678400,
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com'
      },
      {
        protocol: 'https',
        hostname: 'twinset-cdn.thron.com'
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos'
      },
      // Max Mara sources
      {
        protocol: 'https',
        hostname: 'www.online-fashion.ru'
      },
      {
        protocol: 'https',
        hostname: 'online-fashion.ru'
      },
      {
        protocol: 'https',
        hostname: 'cdn.ls.net.ru'
      },
      // Optional: Bosco CDN (if we ever ingest from there)
      {
        protocol: 'https',
        hostname: 'staticv2.bosco.ru'
      }
    ]
  }
};

export default nextConfig;

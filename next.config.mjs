/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.npm_package_version,
  },
}

export default nextConfig

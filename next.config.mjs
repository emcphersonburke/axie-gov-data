/** @type {import('next').NextConfig} */
const config = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'cdn.sanity.io' }],
  },
  sassOptions: {
    prependData: `@import "./src/styles/_variables.scss"; @import "./src/styles/_mixins.scss";`,
  },
  experimental: {
    taint: true,
  },
}

export default config

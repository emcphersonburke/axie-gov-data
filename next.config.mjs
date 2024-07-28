/** @type {import('next').NextConfig} */
const config = {
  sassOptions: {
    prependData: `@import "./src/styles/_variables.scss"; @import "./src/styles/_mixins.scss";`,
  },
  experimental: {
    taint: true,
  },
}

export default config

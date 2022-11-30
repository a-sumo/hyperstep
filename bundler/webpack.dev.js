const { merge } = require('webpack-merge')
const commonConfiguration = require('./webpack.common.js')
const portFinderSync = require('portfinder-sync')
const path = require('path');
const infoColor = (_message) => {
  return `\u001b[1m\u001b[34m${_message}\u001b[39m\u001b[22m`
}

module.exports = (env, argv) => {
  return merge(
    commonConfiguration(env, argv),
    {
      mode: 'development',
      devServer: {
        static: {
          directory: path.join(__dirname, 'dist'),
        },
        compress: true,
        port: 9000,
      },
    }
  )
}

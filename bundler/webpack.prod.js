const { merge } = require('webpack-merge')
const commonConfiguration = require('./webpack.common.js')
const { CleanWebpackPlugin } = require('clean-webpack-plugin')

module.exports = (env, argv) => {
  return merge(
    commonConfiguration(env, argv),
    {
      mode: 'production',
      plugins:
        [
          new CleanWebpackPlugin()
        ]
    }
  )
}

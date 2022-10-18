const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCSSExtractPlugin = require('mini-css-extract-plugin')
const path = require('path')

module.exports = (env, argv) => {
  return {
    entry: path.resolve(__dirname, '../src/script.js'),
    output:
    {
      filename: 'bundle.[contenthash].js',
      path: path.resolve(__dirname, '../dist'),
      publicPath: argv.mode === 'production' ? '/flow/' : '/'
    },
    devtool: 'source-map',
    plugins:
      [
        new HtmlWebpackPlugin({
          template: path.resolve(__dirname, '../src/index.html'),
          minify: true
        }),
        new MiniCSSExtractPlugin()
      ],
    module:
    {
      rules:
        [
          // HTML
          {
            test: /\.(html)$/,
            use: ['html-loader']
          },

          // JS
          {
            test: /\.js$/,
            exclude: /node_modules/,
            use:
              [
                'babel-loader'
              ]
          },

          // CSS
          {
            test: /\.css$/,
            use:
              [
                MiniCSSExtractPlugin.loader,
                'css-loader'
              ]
          },

          // Images
          {
            test: /\.(jpg|png|gif|svg|gltf|bin|ico)$/,
            use:
              [
                {
                  loader: 'file-loader',
                  options:
                  {
                    outputPath: 'assets/images/',
                    name: '[name].[ext]'
                  }
                }
              ]
          },

          // Shaders
          {
            test: /\.(glsl|vs|fs|vert|frag)$/,
            exclude: /node_modules/,
            use:
              [
                'raw-loader'
              ]
          },

          // Fonts
          {
            test: /\.(ttf|eot|woff|woff2)$/,
            use:
              [
                {
                  loader: 'file-loader',
                  options:
                  {
                    outputPath: 'assets/fonts/'
                  }
                }
              ]
          }
        ]
    }
  }
}

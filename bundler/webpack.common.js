const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const path = require('path');

const pages = ["home", "volume", "animation", "playground"];

module.exports = (env, argv) => {
  return {
    // entry: path.resolve(__dirname, '../src/script.js'),
    entry: pages.reduce((config, page) => {
      if (page == 'home'){
        config[page] = `./src/script.js`;
      }
      else{
        config[page] = `./src/${page}/script.js`;
      }
      return config;
    }, {}),
    output:
    {
      filename: 'bundle.[contenthash].js',
      path: path.resolve(__dirname, '../dist'),
      publicPath: argv.mode === 'production' ? '/hyperstep/' : '/'
    },
    optimization: {
    splitChunks: {
      chunks: "all",
      },
    },
    devServer: {
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
    devtool: 'source-map',
      plugins: [new MiniCssExtractPlugin()].concat(
        pages.map(
          (page) =>
            {
              if (page == 'home'){
                return new HtmlWebpackPlugin({
                  inject: true,
                  template: `./src/index.html`,
                  filename: `index.html`,
                  chunks: [page],
                })
              }
              else{
                return new HtmlWebpackPlugin({
                  inject: true,
                  template: `./src/${page}/index.html`,
                  filename: `${page}/index.html`,
                  chunks: [page],
                })
            }
          }
        )
      ),
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
            resourceQuery: { not: [/raw/] },
            exclude: /node_modules/,
            use:
              [
                'babel-loader'
              ]
          },

          // TS
          {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/,
          },
          
          // CSS
          {
            test: /\.css$/,
            use:
              [
                MiniCssExtractPlugin.loader,
                'css-loader',
                'postcss-loader'
              ]
          },

          // Images
          {
            test:  /\.(jpg|png|gif|svg|gltf|bin|ico)$/,
            type: 'asset/resource',
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
          // Audio
          {
            test: /\.(ogg|mp3|wav|mpe?g)$/i,
            type: 'asset/resource',
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

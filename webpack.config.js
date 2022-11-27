
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const pages = ["home", "volume", "vector_field", "octree"];
const path = require('path');

 module.exports = {
   entry: pages.reduce((config, page) => {
    if (page == 'home'){
      config[page] = `./src/script.js`;
    }
    else{
      config[page] = `./src/${page}/script.js`;
    }
    return config;
  }, {}),
  output: {
     filename: '[name].bundle.js',
     path: path.resolve(__dirname, 'dist'),
   },
  optimization: {
    splitChunks: {
      chunks: "all",
    },
  },
  devServer: {
    // allowedHosts: 'auto',
    // these headers are necessary for SharedArrayBuffers to work on localhost
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  plugins: [
  new HtmlWebpackPlugin(),
  new MiniCssExtractPlugin()].concat(
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
   module: {
    rules: [
      {
        test: /\.(jpg|png|svg|gif)$/,
        type: 'asset/resource',
      },
      {
        test: /\.css$/,
        use:
          [
            MiniCssExtractPlugin.loader,
            'css-loader',
            'postcss-loader'
          ]
      },
      {
        test: /\.js$/,
        resourceQuery: { not: [/raw/] },
        exclude: /node_modules/,
        use:
          [
            'babel-loader'
          ]
      },
      {
        resourceQuery: /raw/,
        type: 'asset/source'
      },
      {
        test: /\.(ogg|mp3|wav|mpe?g)$/,
        type: 'asset/resource',
      },
    ],
   }
};


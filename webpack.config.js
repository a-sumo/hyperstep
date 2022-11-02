const path = require('path');
var SRC = path.resolve(__dirname, 'src/assets/audio/');

 module.exports = {
   entry: {
    index: './src/index.js'
   },
   output: {
     filename: '[name].bundle.js',
     path: path.resolve(__dirname, 'dist'),
   },
   module: {
    parser: {
      javascript : { importMeta: false }
    },
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'assets/',
      },
      {
        test: /\.mp3$/,
        use:{
          loader: 'file-loader',
        },
        type: "src/assets/audio/"
      }
    ],
   }
};


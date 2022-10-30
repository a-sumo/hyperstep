const path = require('path');

 module.exports = {
   entry: {
    index: './src/index.js',
    melspectrogram: '.src/melspectrogram-processor.js',
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
        type: 'asset/resource',
      },
      {
        test: /\.mp3$/,
        use: 'file-loader',
        type: 'asset/audio',
      },  
    ],
   }
};


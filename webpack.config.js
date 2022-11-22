const path = require('path');

 module.exports = {
   entry: {
    index: './src/index.js'
   },
   output: {
     filename: '[name].bundle.js',
     path: path.resolve(__dirname, 'dist'),
   },
   module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use:
          [
            'babel-loader'
          ]
      },
      {
        test: /\.mp3$/,
        dependency: { not: ['url'] },
        use: [
          {
            loader: 'file-loader',
          },
        ],
      },
    ],
   }
};


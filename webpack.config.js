const path = require('path');

module.exports = {
  mode: 'development',
  entry: {
    bundle: './src/renderer.js',
    popup: './src/popup.js'
  },
  target: 'web',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              '@babel/preset-react'
            ]
          }
        }
      },
      {
        test: /\.pdf$/,
        use: {
          loader: 'file-loader',
          options: {
            name: '[name].[ext]'
          }
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx'],
    fallback: {
      "path": false,
      "fs": false,
      "stream": false,
      "zlib": false,
      "crypto": false
    }
  },
  externals: {
    electron: 'commonjs electron'
  }
};
// webpack.config.js
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
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
              ['@babel/preset-env', {
                targets: {
                  node: 'current',
                  esmodules: true
                },
                modules: false
              }],
              '@babel/preset-react'
            ]
          }
        },
        resolve: {
          fullySpecified: false
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
  },
  experiments: {
    topLevelAwait: true
  }
};
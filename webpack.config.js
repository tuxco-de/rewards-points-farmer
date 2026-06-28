const path = require('path');
const webpack = require('webpack');
const fs = require('fs');
const TerserPlugin = require('terser-webpack-plugin');

const originalCode = fs.readFileSync(path.resolve(__dirname, 'dist', 'bing_rewards.user.js'), 'utf-8');
const bannerMatch = originalCode.match(/(\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==)/);
const banner = bannerMatch ? bannerMatch[1] : '';

module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bing_rewards.user.js',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false,
          },
        },
        extractComments: false,
      }),
    ],
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: banner,
      raw: true,
      entryOnly: true
    })
  ]
};

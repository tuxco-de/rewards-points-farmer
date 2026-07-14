const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const pkg = require('./package.json');

const banner = `// ==UserScript==
// @name         Rewards Points Farmer
// @name:en      ${pkg.description}
// @namespace    ${pkg.author}
// @version      ${pkg.version}
// @description  自动完成 Microsoft Rewards 在必应（Bing）上的每日搜索任务，带有可配置的UI界面，模拟人工操作以提高安全性。目前最稳定的脚本，全自动完成电脑端90分任务。
// @description:en  Automatically completes Microsoft Rewards daily search tasks on Bing. Features a configurable UI and mimics human behavior for better safety.
// @author       ${pkg.author}
// @match        *://*.bing.com/*
// @grant        GM_registerMenuCommand
// @inject-into  page
// @run-at       document-end
// @license      ${pkg.license}
// ==/UserScript==`;

module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'rewards-points-farmer.user.js',
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
    minimize: false,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: /==\/?UserScript==|@/i,
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

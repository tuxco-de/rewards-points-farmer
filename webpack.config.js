const path = require('path');
const webpack = require('webpack');
const fs = require('fs');

// We will extract the banner from the original file
const originalCode = fs.readFileSync(path.resolve(__dirname, 'bing_rewards.js'), 'utf-8');
const bannerMatch = originalCode.match(/(\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==)/);
const banner = bannerMatch ? bannerMatch[1] : '';

module.exports = {
  mode: 'production',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bing_rewards.user.js',
  },
  optimization: {
    minimize: false, // Userscripts should usually not be minified so they are reviewable
  },
  plugins: [
    new webpack.BannerPlugin({
      banner: banner,
      raw: true, // Output banner exactly as is, without wrapping it in a comment again
      entryOnly: true
    })
  ]
};

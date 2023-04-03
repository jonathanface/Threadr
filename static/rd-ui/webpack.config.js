const path = require('path');
const Dotenv = require('dotenv-webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  console.log(`This is the Webpack 4 'mode': ${argv.mode}`);
  const htmlFile = argv.mode === 'development' ? 'index-dev.html' : 'index.html';
  return {
    entry: path.join(__dirname, 'src', 'index.js'),
    output: {
      path: path.resolve(__dirname, 'build'),
    },
    devtool: 'inline-source-map',
    target: 'web',
    module: {
      rules: [
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader'],
        }, {
          test: /\.?js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react']
            }
          }
        },
      ]
    },
    plugins: [
      new MiniCssExtractPlugin({filename: 'styles.css'}),
      new Dotenv({
        path: './.env',
      }),
      new CopyPlugin({
        patterns: [
          {from: 'public/img', to: 'img'},
          {from: 'public/' + htmlFile, to: 'index.html', toType: 'file'},
        ]
      }),
    ],
  };
};

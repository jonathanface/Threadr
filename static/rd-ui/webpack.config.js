const path = require('path');
const Dotenv = require('dotenv-webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require("mini-css-extract-plugin")

module.exports = {
  entry: path.join(__dirname, "src", "index.js"),
  output: {
    path:path.resolve(__dirname, "build"),
  },
  devtool: "inline-source-map",
  target: 'web',
  devServer: {
    open: true,
    static: {
        directory: path.join(__dirname, "build"),
    },
    port: 83,
    host: 'localhost',
    hot: true
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ["style-loader", "css-loader"],
      },{
        test: /\.?js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react']
          }
        }
      },
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({ filename: "styles.css" }),
    new Dotenv({
        path: './.env',
    })
  ],
}
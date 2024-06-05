const path = require('path');
const webpack = require('webpack');
const fs = require('fs');
const packageJsonContent = fs.readFileSync('./package.json', 'utf8');
const packageJson = JSON.parse(packageJsonContent);

module.exports = {
    devtool: 'source-map',
    entry: './src/lib/gtpl.ts',
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        configFile: path.resolve(__dirname, 'tsconfig-webpack.json')
                    }
                },
                exclude: /node_modules/
            }
        ]
    },
    output: {
        filename: 'gtpl.min.js',
        path: path.resolve(__dirname, 'dist') + '/lib',
        globalObject: 'this',
        library: {
            name: 'gtpl',
            type: 'umd',
            export: 'default'
        }
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    plugins: [
        new webpack.BannerPlugin({
            banner: `/**
* ${packageJson.name} v${packageJson.version}
* (c) 2024 ${packageJson.author}
* @license ${packageJson.license}
* @repository ${packageJson.repository}
**/`,
            raw: true,
            stage: webpack.Compilation.PROCESS_ASSETS_STAGE_REPORT
        })
    ]
};
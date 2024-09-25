const path = require('path');

const paths = {
    src: path.resolve(__dirname, 'src'),
    dist: path.resolve(__dirname, 'dist')
};

const config = {
    context: paths.src,
    entry: {
        index: './index',
        indexHtml: './indexHtml'
    },
    output: {
        path: paths.dist,
        filename: '[name].js'
    },
    resolve: {
        extensions: ['.ts']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            }
        ]
    }
};

const mode = process.argv[4] || 'production';
if (mode !== 'production') {
    config.devtool = 'inline-source-map';
    config.mode = 'development';
} else {
    config.mode = 'production';
}

module.exports = config;

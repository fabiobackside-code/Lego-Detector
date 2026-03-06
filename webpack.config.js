const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: 'development',

    // Ponto de entrada: o orquestrador principal, igual ao DuckHunt que entra por main.js
    entry: './src/machine-learning/main.js',

    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js',
        clean: true,
    },

    devServer: {
        static: './dist',
        port: 8082,
        hot: false,
        // Headers necessarios para SharedArrayBuffer / cross-origin isolation
        // (util se o backend TF.js precisar de features avancadas)
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
    },

    plugins: [
        // Injeta o bundle no index.html automaticamente
        new HtmlWebpackPlugin({
            template: './index.html',
        }),

        // Copia o modelo TF.js (model.json + *.bin + labels.json) para dist/
        // O Web Worker faz fetch() desses arquivos em tempo de execucao
        new CopyPlugin({
            patterns: [
                { from: 'lego_web_model', to: 'lego_web_model', noErrorOnMissing: true },
            ],
        }),
    ],
};

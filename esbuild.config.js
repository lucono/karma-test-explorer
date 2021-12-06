module.exports = {
  entryPoints: [
    './out/main.js',
    './out/frameworks/karma/config/karma.conf.js',
    './out/frameworks/karma/reporter/test-result-emitter-worker.js'
  ],
  outdir: './dist',
  outbase: './src',
  entryNames: '[name]',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  bundle: true,
  minify: true,
  minifyWhitespace: true,
  sourcemap: false,
  keepNames: true,
  tsconfig: './tsconfig.json'
};

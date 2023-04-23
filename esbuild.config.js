import writeFilePlugin from 'esbuild-plugin-write-file';

export default {
  outdir: './dist',
  outExtension: { '.js': '.cjs' },
  outbase: './src',
  entryPoints: [
    './out/main.js',
    './out/frameworks/karma/config/karma.conf.js',
    './out/frameworks/karma/reporter/test-result-emitter-worker.js'
  ],
  plugins: [
    writeFilePlugin({
      after: {
        './dist/main.cjs.js': `export { activate, deactivate } from './main.cjs';`
      }
    })
  ],
  entryNames: '[name]',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  bundle: true,
  minifyIdentifiers: true,
  minifyWhitespace: true,
  minifySyntax: false,
  sourcemap: process.argv.includes('--dev'),
  keepNames: true,
  tsconfig: './tsconfig.json'
};

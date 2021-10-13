const { build } = require('esbuild');
const esbuildConfig = require('../esbuild.config.js');

const startTime = Date.now();

build(esbuildConfig)
  .then(() => {
    const elapsedTime = (Date.now() - startTime) / 1000;
    console.log(`Done bundling in ${elapsedTime.toFixed(2)} secs`);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

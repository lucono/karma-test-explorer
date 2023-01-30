import { build } from 'esbuild';

import esbuildConfig from '../esbuild.config.js';

const bundle = async () => {
  try {
    const startTime = new Date();
    console.log(`Started bundling at ${startTime.toLocaleTimeString()}`);

    await build(esbuildConfig);

    const elapsedTime = (Date.now() - startTime.getTime()) / 1000;
    console.log(`Done bundling in ${elapsedTime.toFixed(2)} secs`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

await bundle();

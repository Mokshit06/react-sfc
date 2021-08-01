// @ts-check
const esbuild = require('esbuild');
const fs = require('fs').promises;
const babel = require('@babel/core');

const watch = process.env.WATCH === 'true';
const minify = process.env.MINIFY === 'true';

/** @type {esbuild.Plugin} */
const metafilePlugin = {
  name: 'write-metafile',
  setup(build) {
    build.onEnd(async ({ metafile }) => {
      await fs.writeFile(
        'build/metafile.json',
        JSON.stringify(metafile, null, 2),
        'utf8'
      );
    });
  },
};

/** @type {esbuild.Plugin} */
const cjsPlugin = {
  name: 'esm-to-cjs',
  setup(build) {
    build.onEnd(async result => {
      // conver esm to cjs
      await Promise.all(
        Object.keys(result.metafile.outputs).map(async file => {
          const { code } = await babel.transformFileAsync(file, {
            presets: [
              ['@babel/preset-env', { targets: 'defaults, not ie 11' }],
            ],
          });
          // const { code } = await esbuild.transform(
          //   await fs.readFile(file, 'utf8'),
          //   { format: 'cjs' }
          // );

          await fs.writeFile(file, code, 'utf8');
        })
      );
    });
  },
};

/** @type {esbuild.BuildOptions} */
const commonConfig = {
  watch,
  bundle: true,
  inject: ['scripts/react-shim.js'],
  minify,
};

Promise.all([
  esbuild.build({
    ...commonConfig,
    entryPoints: ['src/entry.client.tsx'],
    platform: 'browser',
    format: 'esm',
    splitting: true,
    outdir: 'public/build',
    sourcemap: true,
    publicPath: '/build',
    define: {
      'process.env.SERVER': 'false',
    },
  }),
  esbuild.build({
    ...commonConfig,
    entryPoints: { server: 'src/entry.server.tsx' },
    sourcemap: 'inline',
    platform: 'node',
    format: 'esm',
    splitting: true,
    outdir: 'build',
    metafile: true,
    external: [
      'react',
      'react-dom',
      'chalk',
      'express',
      'compression',
      'node-fetch',
    ],
    define: {
      'process.env.SERVER': 'true',
    },
    plugins: [metafilePlugin, cjsPlugin],
  }),
]).catch(() => process.exit(0));

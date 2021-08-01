// @ts-check
const esbuild = require('esbuild');
const fs = require('fs').promises;
const babel = require('@babel/core');
const loaderTransform = require('./babel');

const watch = process.env.WATCH === 'true';
const minify = process.env.MINIFY === 'true';

/** @type {esbuild.Plugin} */
const metafilePlugin = {
  name: 'write-metafile',
  setup(build) {
    build.onEnd(async ({ metafile }) => {
      await fs.writeFile(
        'dist/metafile.json',
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
      await Promise.all(
        Object.keys(result.metafile.outputs).map(async file => {
          // conver esm to cjs
          const { code } = await babel.transformFileAsync(file, {
            presets: [
              ['@babel/preset-env', { targets: 'defaults, not ie 11' }],
            ],
          });

          await fs.writeFile(file, code, 'utf8');
        })
      );
    });
  },
};

/** @type {esbuild.Plugin} */
const loaderPlugin = {
  name: 'loader-plugin',
  setup(build) {
    build.onLoad({ filter: /\.(j|t)sx?/ }, async args => {
      const path = args.path.replace(new RegExp(`^${process.cwd()}/`), '');

      if (path.startsWith('node_modules')) return;

      const result = await babel.transformFileAsync(args.path, {
        presets: ['@babel/preset-typescript'],
        plugins: [loaderTransform, 'babel-plugin-danger-remove-unused-import'],
        sourceMaps: 'inline',
      });

      return {
        contents: result.code,
        loader: 'tsx',
      };
    });
  },
};

/** @type {esbuild.BuildOptions} */
const commonConfig = {
  watch,
  bundle: true,
  inject: ['build/react-shim.js'],
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
    plugins: [loaderPlugin],
  }),
  esbuild.build({
    ...commonConfig,
    entryPoints: { server: 'src/entry.server.tsx' },
    sourcemap: 'inline',
    platform: 'node',
    format: 'esm',
    splitting: true,
    outdir: 'dist',
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

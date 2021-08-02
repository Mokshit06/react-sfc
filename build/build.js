// @ts-check
const esbuild = require('esbuild');
const fs = require('fs').promises;
const babel = require('@babel/core');
const loaderTransform = require('./babel/loader');
const styleTransform = require('./babel/styles');
const murmurhash = require('murmurhash');
const path = require('path');

const watch = process.env.WATCH === 'true';
const minify = process.env.MINIFY === 'true';

/** @type {esbuild.Plugin} */
const metafilePlugin = {
  name: 'write-metafile',
  setup(build) {
    build.onEnd(async ({ metafile }) => {
      build.initialOptions.metafile = true;

      if (!metafile) return;

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
      if (!result.metafile) return;

      await Promise.all(
        Object.keys(result.metafile.outputs)
          .filter(file => file.endsWith('.js'))
          .map(async file => {
            // conver esm to cjs
            const { code } = await esbuild.transform(
              await fs.readFile(file, 'utf8'),
              {
                target: 'node12',
                format: 'cjs',
              }
            );

            await fs.writeFile(file, code, 'utf8');
          })
      );
    });
  },
};

/** @type {(opts?: {isClient:boolean}) => esbuild.Plugin} */
const stylePlugin = ({ isClient } = { isClient: false }) => ({
  name: 'style-plugin',
  setup(build) {
    const cssLookup = new Map();

    build.onResolve({ filter: /\.sfc\.css$/ }, args => {
      return {
        namespace: 'sfc-css',
        path: path.join(args.resolveDir, cssLookup.get(args.path).name),
        pluginData: {
          path: args.path,
        },
      };
    });

    build.onLoad({ filter: /.*/, namespace: 'sfc-css' }, async args => {
      const data = cssLookup.get(args.pluginData.path);

      const result = await esbuild.build({
        stdin: {
          contents: data.css,
          resolveDir: path.parse(args.path).dir,
          loader: 'css',
        },
        bundle: true,
        write: false,
      });

      return {
        contents: result.outputFiles[0].text,
        loader: 'file',
      };
    });

    build.onLoad({ filter: /\.(j|t)sx?$/ }, async args => {
      const parsed = path.parse(args.path);
      const pathWithoutCwd = args.path.replace(
        new RegExp(`^${process.cwd()}/`),
        ''
      );

      if (pathWithoutCwd.startsWith('node_modules')) return;

      /** @type {babel.PluginItem[]} */
      const plugins = [styleTransform];

      if (isClient) {
        plugins.push(
          loaderTransform,
          'babel-plugin-danger-remove-unused-import'
        );
      }

      const result = await babel.transformFileAsync(args.path, {
        presets: ['@babel/preset-typescript'],
        plugins,
        sourceMaps: 'inline',
      });

      const { css } = result.metadata;

      if (!css) {
        return {
          contents: result.code,
          loader: 'tsx',
        };
      }

      const hash = murmurhash.v2(css.css);
      const cssFilename = `${parsed.name}_${hash}.sfc.css`;
      const cssFilePath = cssFilename;

      cssLookup.set(cssFilePath, { css: css.css, name: `${parsed.name}.css` });

      return {
        contents: `
        import __cssFileUrl__ from ${JSON.stringify(cssFilePath)};
        ${result.code}`,
        loader: 'tsx',
      };
    });
  },
});

/** @type {esbuild.BuildOptions} */
const commonConfig = {
  watch,
  bundle: true,
  inject: ['build/react-shim.js'],
  minify,
  assetNames: 'assets/[name]-[hash]',
};

Promise.all([
  esbuild.build({
    ...commonConfig,
    entryPoints: ['src/entry.client.tsx'],
    platform: 'browser',
    format: 'esm',
    splitting: true,
    outdir: 'public/dist',
    sourcemap: true,
    define: {
      'process.env.SERVER': 'false',
    },
    plugins: [stylePlugin({ isClient: true })],
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
    plugins: [stylePlugin(), metafilePlugin, cjsPlugin],
  }),
]).catch(() => process.exit(0));

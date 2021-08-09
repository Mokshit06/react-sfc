import babel, { BabelFileMetadata, PluginItem } from '@babel/core';
import esbuild, { Plugin } from 'esbuild';
import murmurhash from 'murmurhash';
import path from 'path';
import loaderTransform from '../babel/loader';
import styleTransform from '../babel/styles';

const sfcTransform = ({ isClient } = { isClient: false }): Plugin => ({
  name: 'sfc-transform',
  setup(build) {
    const cssLookup = new Map<string, { css: string; name: string }>();

    build.onResolve({ filter: /\.sfc\.css$/ }, args => {
      return {
        namespace: 'sfc-css',
        path: path.join(args.resolveDir, args.path),
        pluginData: {
          filename: args.path,
        },
      };
    });

    build.onLoad({ filter: /.*/, namespace: 'sfc-css' }, async args => {
      const { filename } = args.pluginData as { filename: string };

      return {
        contents: cssLookup.get(filename).css,
        resolveDir: path.dirname(args.path),
        loader: 'css',
      };
    });

    build.onLoad({ filter: /\.(j|t)sx?$/ }, async args => {
      const parsed = path.parse(args.path);
      const pathWithoutCwd = args.path.replace(
        new RegExp(`^${process.cwd()}/`),
        ''
      );

      if (pathWithoutCwd.startsWith('node_modules')) return;

      const plugins: PluginItem[] = [styleTransform];

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

      const { css } = result.metadata as BabelFileMetadata & {
        css: { css: string; name: string };
      };

      if (!css) {
        return {
          contents: result.code,
          loader: 'tsx',
        };
      }

      const hash = murmurhash.v2(css.css);
      const cssFilename = `${parsed.name}_${hash}.sfc.css`;

      // set `name` to raw css name without hash
      // so that it can be used during path resolution
      // to prevent double hashing
      cssLookup.set(cssFilename, { css: css.css, name: `${parsed.name}.css` });

      return {
        contents: `
        import ${JSON.stringify(cssFilename)};
        ${result.code}`,
        loader: 'tsx',
      };
    });
  },
});

export default sfcTransform;

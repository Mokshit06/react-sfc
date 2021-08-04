import babel, { BabelFileMetadata, PluginItem } from '@babel/core';
import esbuild, { Plugin } from 'esbuild';
import murmurhash from 'murmurhash';
import path from 'path';
import loaderTransform from '../babel/loader';
import styleTransform from '../babel/styles';

const sfcTransform = ({ isClient } = { isClient: false }): Plugin => ({
  name: 'sfc-transform',
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
        css: { cssText: string; name: string };
      };

      if (!css.cssText) {
        return {
          contents: result.code,
          // TODO infer loader
          loader: 'tsx',
        };
      }

      const hash = murmurhash.v2(css.cssText);
      const cssFilename = `${parsed.name}_${hash}.sfc.css`;
      const cssFilePath = cssFilename;

      cssLookup.set(cssFilePath, {
        css: css.cssText,
        name: `${parsed.name}.css`,
      });

      return {
        contents: `
        import __cssFileUrl__ from ${JSON.stringify(cssFilePath)};
        ${result.code}`,
        // TODO infer loader
        loader: 'tsx',
      };
    });
  },
});

export default sfcTransform;

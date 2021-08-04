import esbuild, { BuildOptions } from 'esbuild';
import esmToCjs from './esbuild/esm-to-cjs';
import sfcTransform from './esbuild/sfc-transform';
import writeMetafile from './esbuild/write-metafile';
import pkg from '../package.json';

const watch = process.env.WATCH === 'true';
const minify = process.env.MINIFY === 'true';

const commonConfig: BuildOptions = {
  watch,
  bundle: true,
  inject: ['build/react-shim.ts'],
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
      'process.env.EVAL': 'false',
    },
    plugins: [sfcTransform({ isClient: true })],
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
      ...Object.keys(pkg.dependencies),
      ...Object.keys(pkg.devDependencies),
    ],
    define: {
      'process.env.SERVER': 'true',
      'process.env.EVAL': 'false',
    },
    plugins: [sfcTransform(), writeMetafile, esmToCjs],
  }),
]).catch(() => process.exit(0));

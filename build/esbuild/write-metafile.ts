import { Plugin } from 'esbuild';
import { promises as fs } from 'fs';

const writeMetafile: Plugin = {
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

export default writeMetafile;

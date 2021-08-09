import esbuild, { Plugin } from 'esbuild';
import { promises as fs } from 'fs';

const esmToCjs: Plugin = {
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

export default esmToCjs;

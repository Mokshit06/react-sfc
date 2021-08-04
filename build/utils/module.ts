/**
 * Modified from @linaria/babel-preset
 * https://github.com/callstack/linaria/blob/HEAD/packages/babel/src/module.ts
 *
 * - added esbuild to transform file before evaluating it
 * - rather than shaking unused code or creating statements based on interpolation, this just executes the entire file
 * - this might cause issues with browser or node globals
 */

import type { BabelFileResult } from '@babel/core';
import esbuild from 'esbuild';
import fs from 'fs';
import NativeModule from 'module';
import path from 'path';
import vm from 'vm';
import * as EvalCache from './eval-cache';

const noop = () => {};

const mockedProcess = {
  nextTick: (fn: Function) => setTimeout(fn, 0),
  platform: 'browser',
  arch: 'browser',
  execPath: 'browser',
  title: 'browser',
  pid: 1,
  browser: true,
  argv: [],
  binding() {
    throw new Error('No such module. (Possibly not yet loaded)');
  },
  cwd: () => '/',
  exit: noop,
  kill: noop,
  chdir: noop,
  umask: noop,
  dlopen: noop,
  uptime: noop,
  memoryUsage: noop,
  uvCounters: noop,
  features: {},
  env: process.env,
};

type Evaluator = (
  filename: string,
  options: any,
  text: string,
  only: string[] | null
) => [string, Map<string, string[]> | null];

const builtins = NativeModule.builtinModules;
let cache: { [id: string]: Module } = {};

class Module {
  id: string;
  filename: string;
  options: any;
  paths: string[];
  exports: any;
  extensions: string[];
  dependencies: string[] | null;
  transform: ((text: string) => BabelFileResult | null) | null;

  static invalidate() {
    cache = {};
  }

  static invalidateEvalCache() {
    EvalCache.clear();
  }

  static _resolveFilename(
    id: string,
    options: { id: string; filename: string; paths: string[] }
  ) {
    return (
      NativeModule as unknown as {
        _resolveFilename: (id: string, options: any) => string;
      }
    )._resolveFilename(id, options);
  }

  static _nodeModulePaths(filename: string) {
    return (
      NativeModule as unknown as {
        _nodeModulePaths: (filename: string) => string[];
      }
    )._nodeModulePaths(filename);
  }

  constructor(filename: string, options: any) {
    this.id = filename;
    this.filename = filename;
    this.options = options;
    this.paths = [];
    this.dependencies = null;
    this.transform = null;

    Object.defineProperties(this, {
      id: {
        value: filename,
        writable: false,
      },
      filename: {
        value: filename,
        writable: false,
      },
      paths: {
        value: Object.freeze(
          (
            NativeModule as unknown as {
              _nodeModulePaths(filename: string): string[];
            }
          )._nodeModulePaths(path.dirname(filename))
        ),
        writable: false,
      },
    });

    this.exports = {};

    this.extensions = ['.json', '.js', '.jsx', '.ts', '.tsx'];
  }

  resolve(id: string) {
    const extensions = (
      NativeModule as unknown as {
        _extensions: { [key: string]: Function };
      }
    )._extensions;
    const added: string[] = [];

    try {
      // Check for supported extensions
      this.extensions.forEach(ext => {
        if (ext in extensions) {
          return;
        }

        // When an extension is not supported, add it
        // And keep track of it to clean it up after resolving
        // Use noop for the transform function since we handle it
        extensions[ext] = noop;
        added.push(ext);
      });

      return Module._resolveFilename(id, this);
    } finally {
      // Cleanup the extensions we added to restore previous behaviour
      added.forEach(ext => delete extensions[ext]);
    }
  }

  require: {
    (id: string): any;
    resolve: (id: string) => string;
    ensure: () => void;
    cache: typeof cache;
  } = Object.assign(
    (id: string) => {
      if (builtins.includes(id)) {
        return require(id);
      }

      // Resolve module id (and filename) relatively to parent module
      const filename = this.resolve(id);
      if (filename === id && !path.isAbsolute(id)) {
        // The module is a builtin node modules, but not in the allowed list
        throw new Error(
          `Unable to import "${id}". Importing Node builtins is not supported in the sandbox.`
        );
      }

      this.dependencies?.push(id);

      let cacheKey = filename;
      let only: string[] = [];
      // if (this.imports?.has(id)) {
      //   // We know what exactly we need from this module. Let's shake it!
      //   only = this.imports.get(id)!.sort();
      //   if (only.length === 0) {
      //     // Probably the module is used as a value itself
      //     // like `'The answer is ' + require('./module')`
      //     only = ['default'];
      //   }

      //   cacheKey += `:${only.join(',')}`;
      // }

      let m = cache[cacheKey];

      if (!m) {
        // Create the module if cached module is not available
        m = new Module(filename, this.options);
        m.transform = this.transform;

        // Store it in cache at this point with, otherwise
        // we would end up in infinite loop with cyclic dependencies
        cache[cacheKey] = m;

        if (this.extensions.includes(path.extname(filename))) {
          // To evaluate the file, we need to read it first
          const code = fs.readFileSync(filename, 'utf-8');
          if (/\.json$/.test(filename)) {
            // For JSON files, parse it to a JS object similar to Node
            m.exports = JSON.parse(code);
          } else {
            m.evaluate(code, only.includes('*') ? null : only);
          }
        } else {
          // For non JS/JSON requires, just export the id
          // This is to support importing assets in webpack
          // The module will be resolved by css-loader
          m.exports = id;
        }
      } else {
      }

      return m.exports;
    },
    {
      ensure: noop,
      cache,
      resolve: this.resolve,
    }
  );

  evaluate(rawText: string, only: string[] | null = null) {
    const filename = this.filename;
    const matchedRules = this.options.rules
      .filter(({ test }) => {
        if (!test) {
          return true;
        }

        if (typeof test === 'function') {
          // this is not a test
          // eslint-disable-next-line jest/no-disabled-tests
          return test(filename);
        }

        if (test instanceof RegExp) {
          return test.test(filename);
        }

        return false;
      })
      .reverse();

    const cacheKey = [this.filename, ...(only ?? [])];

    try {
      if (EvalCache.has(cacheKey, rawText)) {
        this.exports = EvalCache.get(cacheKey, rawText);
        return;
      }

      let code: string | null | undefined;

      const action =
        matchedRules.length > 0 ? matchedRules[0].action : 'ignore';

      if (action === 'ignore') {
        code = rawText;
      } else {
        const { code: text } = esbuild.transformSync(rawText, {
          format: 'cjs',
          target: 'node12',
          // TODO infer actual loader based on filename
          // using tsx right now as it work with transform every file
          loader: 'tsx',
          sourcemap: false,
          define: {
            'process.env.EVAL': 'true',
          },
        });

        code = text;
      }

      const script = new vm.Script(
        `(function (exports) {  ${code} })(exports);`,
        {
          filename: this.filename,
        }
      );

      script.runInContext(
        vm.createContext({
          clearImmediate: noop,
          clearInterval: noop,
          clearTimeout: noop,
          setImmediate: noop,
          setInterval: noop,
          setTimeout: noop,
          Buffer,
          global,
          process: mockedProcess,
          module: this,
          exports: this.exports,
          require: this.require,
          __filename: this.filename,
          __dirname: path.dirname(this.filename),
        })
      );

      EvalCache.set(cacheKey, rawText, this.exports);
    } catch (error) {
      console.error(error.message);
    }
  }
}

export default Module;

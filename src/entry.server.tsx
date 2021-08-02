import chalk from 'chalk';
import compression from 'compression';
import type { Metafile } from 'esbuild';
import express from 'express';
import { promises as fs } from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { pipeToNodeWritable } from 'react-dom/unstable-fizz.js';
import App from './app';

global.fetch = fetch;

const app = express();

app.use(compression());

app.use(async (req, res, next) => {
  // if (req.path.includes('home') && req.path.includes('css')) {
  //   // block css request for 3s
  //   await new Promise(resolve => setTimeout(resolve, 3000));
  // }

  express.static('public')(req, res, next);
});

const errHandler = error => {
  console.error('Fatal', error);
};

const entries = new Map<string, any>();
let metafile: Metafile;

app.get('/api/*', async (req, res) => {
  const filePath: string = req.params[0];

  if (!metafile) {
    metafile = JSON.parse(
      await fs.readFile(path.join(__dirname, './metafile.json'), 'utf8')
    );
  }

  const file = Object.entries(metafile.outputs).find(([file, data]) => {
    return data.entryPoint === filePath;
  });

  if (!file) {
    return res.status(404).send('file not found');
  }

  const [outfile] = file;
  try {
    const mod = require(`../${outfile}`);
    const data = await mod.loader();

    res.send(data);
  } catch (error) {
    console.log(error);
    res.status(500).send(error);
  }
});

app.get('*', async (req, res) => {
  res.socket.on('error', errHandler);
  let didError = false;

  // const stream = new Writable({
  //   write(chunk, encoding, callback) {
  //     callback();
  //   },
  // });

  const { startWriting, abort } = pipeToNodeWritable(<App />, res, {
    onReadyToStream() {
      res.statusCode = didError ? 500 : 200;
      res.setHeader('Content-type', 'text/html');
      res.write('<!DOCTYPE html>');
      startWriting();
    },
    onError(err) {
      didError = true;
      console.error(err);
    },
  });

  res.socket.off('error', errHandler);

  setTimeout(abort, 5000);
});

app.listen(5000, () => {
  console.log(chalk.green`Server started at {bold http://localhost:5000}`);
});

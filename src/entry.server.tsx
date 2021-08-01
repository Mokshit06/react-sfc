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

app.use(express.static('public'));

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
  const mod = require(`../${outfile}`);

  const data = await mod.loader();

  res.send(data);
});

app.get('*', async (req, res) => {
  res.socket.on('error', errHandler);
  let didError = false;

  const { startWriting, abort } = pipeToNodeWritable(<App />, res, {
    onReadyToStream() {
      res.statusCode = didError ? 500 : 200;
      res.setHeader('Content-type', 'text/html');
      res.write('<!DOCTYPE html>');
      startWriting();
      res.socket.off('error', errHandler);
    },
    onError(err) {
      didError = true;
      console.error(err);
    },
  });

  setTimeout(abort, 10000);
});

app.listen(5000, () => {
  console.log(chalk.green`Server started at {bold http://localhost:5000}`);
});

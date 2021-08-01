import wrapPromise from 'src/utils/wrap-promise';
import { promises as fs } from 'fs';
import path from 'path';

export async function loader() {
  const data = await fs.readFile(
    path.join(process.cwd(), 'src/data/file.txt'),
    'utf8'
  );

  return {
    text: data,
  };
}

const resource = wrapPromise(loader());

export default function Home() {
  const { text } = resource.read();

  return (
    <>
      <h1>Home</h1>
      <pre>{JSON.stringify(text)}</pre>
    </>
  );
}

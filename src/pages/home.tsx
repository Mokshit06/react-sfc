import wrapPromise from 'src/utils/wrap-promise';

export async function loader() {
  // generate this code
  // rather than doing it manually
  if (process.env.SERVER) {
    const fs = require('fs').promises;
    const path = require('path');
    const data = await fs.readFile(
      path.join(process.cwd(), 'src/data/file.txt'),
      'utf8'
    );

    return {
      text: data,
    };
  } else {
    const res = await fetch(`/api/src/pages/home.tsx`);
    const data = await res.json();

    return data;
  }
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

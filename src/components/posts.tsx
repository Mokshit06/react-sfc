import wrapPromise from 'src/utils/wrap-promise';

export async function loader() {
  const res = await fetch(
    'https://jsonplaceholder.typicode.com/posts?_limit=10'
  );
  const data = await res.json();

  return {
    posts: data,
  };
}

const resource = wrapPromise(loader());

export default function Home() {
  const { posts } = resource.read();

  return (
    <>
      <h1>Posts</h1>
      <pre>{JSON.stringify(posts)}</pre>
    </>
  );
}

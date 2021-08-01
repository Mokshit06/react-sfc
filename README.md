# React Single File Components

## Problem

Most apps use Next.js or a similar framework for server rendering. These frameworks allow us to write our dependencies in the root page file and that data can be passed down as props to child components. The issue with this is that the component cannot describe its own data dependencies and has to depend on its parent for them.

## Idea

By adding an intermediate build step, we can make a pattern similar to Single File Components in React. The component can describe its own data dependencies in its own file and seperate bundles can be produced for the server and client. In the client code, the `loader` will be replaced with a function that fetches a path with the file name in it, and the server `loader` will stay as is. Both of these loaders will be wrapped in a function that throws a promise if the function hasn't returned a value yet, which the `<Suspense>` boundary can catch and show the fallback component. This way, only the components that are being rendered on the page will fetch the data and these loaders should be able to use any native node modules.

This pattern can be extended to allow styles to be written in the same file as well.

## Example

Example React SFC:

```js
import { read } from 'lib';

export async function loader() {
  return {
    hello: 'world',
  };
}

export function Component(props) {
  const { hello } = read<typeof loader>();

  return <h1>{hello}</h1>;
}
```

Compiled output:

- Server:-

  ```js
  import { wrapPromise } from 'lib';

  const resource = wrapPromise(loader());

  async function loader() {
    return {
      hello: 'world',
    };
  }

  export function Component(props) {
    const { hello } = resource.read();

    return <h1>{hello}</h1>;
  }
  ```

- Client:-

  ```js
  import { wrapPromise } from 'lib';

  const resource = wrapPromise(loader());

  async function loader() {
    const res = await fetch('/api/src/filepath.tsx');
    const data = await res.json();

    return data;
  }

  export function Component(props) {
    const { hello } = resource.read();

    return <h1>{hello}</h1>;
  }
  ```

## Limitations

- Each component that fetches data needs to be a seperate chunk. This can result in many small chunks getting fetching on client side, though it shouldn't be an issue with HTTP/2.
- Each component that is fetching data needs to be wrapped in a `<Suspense>` boundary, and either needs to be imported using `React.lazy` or have a dynamic import to that path somewhere in the code. This would result that file getting bundled in a seperate chunk which is required for the loaders to work on server.

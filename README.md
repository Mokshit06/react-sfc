# React Single File Components

## Problem

Most apps use Next.js or a similar framework for server rendering. These frameworks allow us to write our dependencies in the root page file and that data can be passed down as props to child components. The issue with this is that the component cannot describe its own data dependencies and has to depend on its parent for them.

## Idea

By adding an intermediate build step, we can make a pattern similar to Single File Components in React. The component can describe its own data dependencies in its own file and seperate bundles can be produced for the server and client. In the client code, the `loader` will be replaced with a function that fetches a path with the file name in it, and the server `loader` will stay as is. Both of these loaders will be wrapped in a function that throws a promise if the function hasn't returned a value yet, which the `<Suspense>` boundary can catch and show the fallback component. This way, only the components that are being rendered on the page will fetch the data and these loaders should be able to use any native node modules.

This pattern also allows styles to be defined in the component itself and it gets hashed and extracted at build time.

## Example

Example React SFC:

```js
import { wrapPromise } from '../utils/wrap-promise';
import { css } from '../utils/css';
import { colors } from '../theme';

// this gets removed from the client bundle
export async function loader() {
  return {
    hello: 'world',
  };
}

const resource = wrapPromise(loader());

// this string gets parsed by the css parser
// it can have any valid css-module syntax
export const styles = css`
  .heading {
    /* eval at build time */
    color: ${colors.primary};
  }
`;

export default function Component(props) {
  const { hello } = resource.read();

  return (
    <>
      <styles.link />
      <h1 className={styles.heading}>{hello}</h1>
    </>
  );
}
```

Compiled output:

- Server:-

  ```js
  import { wrapPromise } from '../utils/wrap-promise';

  export async function loader() {
    return {
      hello: 'world',
    };
  }

  const resource = wrapPromise(loader());

  export const styles = {
    heading: 'heading_HASH',
    link: props => <link {...props} rel="stylesheet" href="css_HASH" />,
  };

  export function Component(props) {
    const { hello } = resource.read();

    return (
      <>
        <styles.link />
        <h1 className={styles.heading}>{hello}</h1>
      </>
    );
  }
  ```

- Client:-

  ```js
  import 'heading_HASH.css';
  import { wrapPromise } from '../utils/wrap-promise';

  // server code gets removed
  async function loader() {
    const res = await fetch('/api/src/components/file.tsx');
    const data = await res.json();

    return data;
  }

  const resource = wrapPromise(loader());

  export const styles = {
    heading: 'heading_HASH',
    link: props => <link {...props} rel="stylesheet" href="css_HASH" />,
  };

  export function Component(props) {
    const { hello } = resource.read();

    return (
      <>
        <styles.link />
        <h1 className={styles.heading}>{hello}</h1>
      </>
    );
  }
  ```

## Limitations

- Each component that fetches data needs to be a seperate chunk. This can result in many small chunks getting fetching on client side, though it shouldn't be an issue with HTTP/2.
- Each component that is fetching data needs to be wrapped in a `<Suspense>` boundary, and either needs to be imported using `React.lazy` or have a dynamic import to that path somewhere in the code. This would result that file getting bundled in a seperate chunk which is required for the loaders to work on server.

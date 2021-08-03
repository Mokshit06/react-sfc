import { promises as fs } from 'fs';
import path from 'path';
import { lazy, Suspense } from 'react';
import { colors } from 'src/theme';
import css from 'src/utils/css';
import wrapPromise from 'src/utils/wrap-promise';

const Posts = lazy(() => import('../components/posts'));

// this can call any node built-in modules
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

// zero-runtime css
export const styles = css`
  .heading {
    /* interpolate strings and numbers */
    /* gets evaluated at build time */
    color: ${colors.primary};
  }
`;

export default function Home() {
  const { text } = resource.read();

  return (
    <>
      <styles.link />
      <h1 className={styles.heading}>Home</h1>
      <pre>{text}</pre>
      <Suspense fallback="Loading..">
        <Posts />
      </Suspense>
    </>
  );
}

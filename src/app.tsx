import { lazy, Suspense } from 'react';
import css from './utils/css';

const Home = lazy(() => import('./pages/home'));

export const styles = css`
  /* import css files */
  @import './styles/global.css';

  .link {
    color: blue;
  }
`;

export default function App() {
  return (
    <html>
      <head>
        <styles.link />
      </head>
      <body>
        <div id="app">
          <h1>Hello world</h1>
          <Suspense fallback="Loading...">
            <Home />
          </Suspense>
        </div>
        <script src="/dist/entry.client.js" type="module" />
      </body>
    </html>
  );
}

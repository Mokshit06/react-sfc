import { lazy, Suspense } from 'react';

const Home = lazy(() => import('./pages/home'));

export default function App() {
  return (
    <html>
      <head>
        <link rel="stylesheet" href="/build/entry.client.css" />
      </head>
      <body>
        <div id="app">
          <h1>Hello world</h1>
          <Suspense fallback="Loading...">
            <Home />
          </Suspense>
        </div>
        <script src="/build/entry.client.js" type="module" />
      </body>
    </html>
  );
}

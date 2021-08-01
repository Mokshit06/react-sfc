const babel = require('@babel/core');

/**
 * @param {{ types: babel.types }} babel
 * @returns {babel.PluginObj<any>}
 */
function loaderTransform(babel) {
  const { types: t } = babel;

  return {
    name: 'loader-transform',
    visitor: {
      ExportNamedDeclaration(path, state) {
        const declaration =
          /** @type {babel.NodePath<babel.types.FunctionDeclaration>} */ (
            path.get('declaration')
          );

        const declarationNode = declaration.node;

        if (!declarationNode) return;

        const exportName = declaration.node.id.name;

        if (exportName !== 'loader') return;
        if (!t.isFunctionDeclaration(declaration)) return;

        const filename = state.filename.replace(
          new RegExp(`^${process.cwd()}/`),
          ''
        );

        const fetchDeclaration = t.functionDeclaration(
          t.identifier('loader'),
          [],
          t.blockStatement([
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier('res'),
                t.awaitExpression(
                  t.callExpression(t.identifier('fetch'), [
                    t.stringLiteral(`/api/${filename}`),
                  ])
                )
              ),
            ]),
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier('data'),
                t.awaitExpression(
                  t.callExpression(
                    t.memberExpression(
                      t.identifier('res'),
                      t.identifier('json')
                    ),
                    []
                  )
                )
              ),
            ]),
            t.returnStatement(t.identifier('data')),
          ]),
          false,
          true
        );

        declaration.replaceWith(fetchDeclaration);
      },
    },
  };
}

function parse() {
  const result = babel.transformSync(
    `
export function loader() {
  const fs = require('fs');
  return {fs};
}
`,
    {
      filename: 'hello.js',
      plugins: [loaderTransform],
    }
  );

  console.log(result.code);
}

// parse();
// console.dir(
//   babel.parse(`
// async function loader() {
//   const res = await fetch('/api');
//   const data = await res.json();
//   return data;
// }
// `),
//   { depth: 20 }
// );

module.exports = loaderTransform;

import { PluginObj, types as BabelTypes } from '@babel/core';

export default function loaderTransform({
  types: t,
}: {
  types: typeof BabelTypes;
}): PluginObj<any> {
  return {
    name: 'loader-transform',
    visitor: {
      ExportNamedDeclaration(path, state) {
        const declaration = path.get('declaration');

        if (
          !t.isFunctionDeclaration(declaration) ||
          !t.isFunctionDeclaration(declaration.node)
        ) {
          return;
        }

        const exportName = declaration.node?.id?.name;

        if (exportName !== 'loader') return;

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

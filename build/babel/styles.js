const babel = require('@babel/core');
const postcss = require('postcss').default;

/** @type {babel.BabelFileMetadata} */
let b;

/**
 * @param {{types: babel.types}} babel
 * @returns {babel.PluginObj<any>}
 */
function styleTransform({ types: t }) {
  return {
    name: 'style-transform',
    visitor: {
      // TODO only transform exported styles
      TaggedTemplateExpression(path, state) {
        /** @type {any} */
        const tag = path.get('tag').node;

        if (!tag) return;
        if (tag.name !== 'css') return;

        // @ts-ignore
        const string = path.get('quasi.quasis.0.value.raw').node;

        let classes;
        const result = postcss([
          require('postcss-modules-sync').default({
            getJSON(json) {
              classes = json;
            },
          }),
        ]).process(string, { from: 'my_file.css' });

        state.file.metadata.css = {
          classes,
          css: result.css,
        };

        const classesDeclaration = t.objectExpression([
          ...Object.entries(classes)
            .filter(([name]) => name !== 'link')
            .map(([name, hash]) =>
              t.objectProperty(t.identifier(name), t.stringLiteral(hash))
            ),
          // props => <link {...props} rel="stylesheet" href="HASH" />
          t.objectProperty(
            t.identifier('link'),
            t.functionExpression(
              null,
              [t.identifier('props')],
              t.blockStatement([
                t.returnStatement(
                  t.jsxElement(
                    t.jsxOpeningElement(
                      t.jsxIdentifier('link'),
                      [
                        t.jsxSpreadAttribute(t.identifier('props')),
                        t.jsxAttribute(
                          t.jsxIdentifier('rel'),
                          t.stringLiteral('stylesheet')
                        ),
                        t.jsxAttribute(
                          t.jsxIdentifier('href'),
                          t.jsxExpressionContainer(
                            t.templateLiteral(
                              [
                                t.templateElement({ raw: '/dist' }, false),
                                t.templateElement({ raw: '' }, true),
                              ],
                              [
                                t.callExpression(
                                  t.memberExpression(
                                    t.identifier('__cssFileUrl__'),
                                    t.identifier('slice')
                                  ),
                                  [t.numericLiteral(1)]
                                ),
                              ]
                            )
                          )
                        ),
                      ],
                      true
                    ),
                    null,
                    []
                  )
                ),
              ])
            )
          ),
        ]);

        path.replaceWith(classesDeclaration);
      },
    },
  };
}

module.exports = styleTransform;

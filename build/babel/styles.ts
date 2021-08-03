import { PluginObj, types as BabelTypes } from '@babel/core';
import generator from '@babel/generator';
import postcss from 'postcss';

export default function styleTransform({
  types: t,
}: {
  types: typeof BabelTypes;
}): PluginObj<any> {
  return {
    name: 'style-transform',
    visitor: {
      // TODO only transform exported styles
      TaggedTemplateExpression(path, state) {
        const tag = path.get('tag').node as BabelTypes.Identifier;

        if (!tag) return;
        if (tag.name !== 'css') return;

        const { quasi } = path.node;
        const expressions = path.get('quasi').get('expressions');

        let cssText = '';

        quasi.quasis.forEach((el, i) => {
          cssText += el.value.cooked;

          const ex = expressions[i];

          if (ex && !ex.isExpression()) {
            throw ex.buildCodeFrameError(
              `Expression ${generator(ex.node).code} is not supported`
            );
          }

          if (ex) {
            const result = ex.evaluate();

            if (result.confident) {
              cssText += String(result.value)
                .replace(/[\r\n]+/g, ' ')
                .trim();
            } else {
              throw ex.buildCodeFrameError(
                `Expression ${generator(ex.node).code} cannot be evaluated`
              );
            }
          }
        });

        let classes: Record<string, string>;
        const result = postcss([
          require('postcss-modules-sync').default({
            getJSON(json) {
              classes = json;
            },
          }),
        ]).process(cssText, { from: state.filename });

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

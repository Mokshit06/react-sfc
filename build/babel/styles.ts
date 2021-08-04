import { NodePath, PluginObj, types as BabelTypes } from '@babel/core';
import generator from '@babel/generator';
import { expression, statement } from '@babel/template';
import { Scope } from '@babel/traverse';
import postcss from 'postcss';
import Module from '../utils/module';

type CSSData = {
  classes: Record<string, string>;
  cssText: string;
};

type ValueCache = Map<string | BabelTypes.Expression, number | string>;
type TemplateExpression = {
  path: NodePath<BabelTypes.TaggedTemplateExpression>;
  expressionValues: any[];
};

type State = CSSData & {
  queue: TemplateExpression[];
  valueCache: ValueCache;
  filename: string;
  opts: {
    valueCache: ValueCache;
  };
  file: {
    metadata: {
      css: CSSData;
    };
  };
};

const expressionWrapperTpl = statement(`
  const %%wrapName%% = (fn) => {
    try {
      return fn();
    } catch (e) {
      return e;
    }
  };
`);

const expressionTpl = expression(`%%wrapName%%(() => %%expression%%)`);
const exportsLinariaPrevalTpl = statement(
  `exports.__linariaPreval = %%expressions%%`
);

function findFreeName(scope: Scope, name: string): string {
  // By default `name` is used as a name of the function …
  let nextName = name;
  let idx = 0;
  while (scope.hasBinding(nextName, false)) {
    // … but if there is an already defined variable with this name …
    // … we are trying to use a name like wrap_N
    idx += 1;
    nextName = `wrap_${idx}`;
  }

  return nextName;
}

function addCSSPreval(
  { types: t }: { types: typeof BabelTypes },
  path: NodePath<BabelTypes.Program>,
  lazyDeps: Array<BabelTypes.Expression | string>
): BabelTypes.Program {
  // Constant __linariaPreval with all dependencies
  const wrapName = findFreeName(path.scope, '_wrap');
  const statements = [
    expressionWrapperTpl({ wrapName }),
    exportsLinariaPrevalTpl({
      expressions: t.arrayExpression(
        lazyDeps.map(expression => expressionTpl({ expression, wrapName }))
      ),
    }),
  ];

  const programNode = path.node;
  return t.program(
    [...programNode.body, ...statements],
    programNode.directives,
    programNode.sourceType,
    programNode.interpreter
  );
}

const options = {
  evaluate: true,
  rules: [{ test: /[\\/]node_modules[\\/]/, action: 'ignore' }],
};

function evaluate(code: string, filename: string) {
  const m = new Module(filename, options);

  m.dependencies = [];
  m.evaluate(code, ['__linariaPreval']);

  return {
    value: m.exports,
    dependencies: m.dependencies,
  };
}

/**
 * Hoist the node and its dependencies to the highest scope possible
 */
function hoist(
  babel: { types: typeof BabelTypes },
  ex: NodePath<BabelTypes.Expression | null>
) {
  const Identifier = (idPath: NodePath<BabelTypes.Identifier>) => {
    if (!idPath.isReferencedIdentifier()) {
      return;
    }
    const binding = idPath.scope.getBinding(idPath.node.name);
    if (!binding) return;
    const { scope, path: bindingPath, referencePaths } = binding;
    // parent here can be null or undefined in different versions of babel
    if (!scope.parent) {
      // It's a variable from global scope
      return;
    }

    if (bindingPath.isVariableDeclarator()) {
      const initPath = bindingPath.get(
        'init'
      ) as NodePath<BabelTypes.Expression | null>;
      hoist(babel, initPath);
      initPath.hoist(scope);
      if (initPath.isIdentifier()) {
        referencePaths.forEach(referencePath => {
          referencePath.replaceWith(babel.types.identifier(initPath.node.name));
        });
      }
    }
  };

  if (ex.isIdentifier()) {
    return Identifier(ex);
  }

  ex.traverse({
    Identifier,
  });
}

function CollectDependencies(
  babel: { types: typeof BabelTypes },
  path: NodePath<BabelTypes.TaggedTemplateExpression>,
  state: State,
  options: any
) {
  const { types: t } = babel;
  const tag = path.get('tag').node as BabelTypes.Identifier;

  if (!tag) return;
  if (tag.name !== 'css') return;

  const expressions = path.get('quasi').get('expressions');

  const expressionValues: any[] = expressions.map(
    (ex: NodePath<BabelTypes.Expression | BabelTypes.TSType>) => {
      if (!ex.isExpression()) {
        throw ex.buildCodeFrameError(
          `The expression '${generator(ex.node).code}' is not supported.`
        );
      }

      const result = ex.evaluate();

      if (result.confident) {
        return { kind: 'VALUE', value: result.value };
      }

      if (!(t.isFunctionExpression(ex) || t.isArrowFunctionExpression(ex))) {
        const originalExNode = t.cloneNode(ex.node);

        hoist(babel, ex as NodePath<BabelTypes.Expression | null>);

        // save hoisted expression to be used to evaluation
        const hoistedExNode = t.cloneNode(ex.node);

        // get back original expression to the tree
        ex.replaceWith(originalExNode);

        return { kind: 'LAZY', ex: hoistedExNode, originalEx: ex };
      }

      return { kind: 'FUNCTION', ex };
    }
  );

  state.queue.push({
    path,
    expressionValues,
  });
}

function isNodePath<T extends BabelTypes.Node>(
  obj: NodePath<T> | T
): obj is NodePath<T> {
  return 'node' in obj && obj?.node !== undefined;
}

function unwrapNode<T extends BabelTypes.Node>(
  item: NodePath<T> | T | string
): T | string {
  if (typeof item === 'string') {
    return item;
  }

  return isNodePath(item) ? item.node : item;
}

const processedPaths = new WeakSet();

export default function styleTransform(babel: {
  types: typeof BabelTypes;
}): PluginObj<State> {
  const { types: t } = babel;

  return {
    name: 'style-transform',
    visitor: {
      Program: {
        enter(path, state) {
          state.classes = {};
          state.cssText = '';
          state.queue = [];
          state.valueCache = state.opts.valueCache;

          Module.invalidate();

          path.traverse({
            TaggedTemplateExpression(p) {
              CollectDependencies(babel, p, state, options);
            },
          });

          const lazyDeps = state.queue.reduce(
            (acc, { expressionValues: values }) => {
              acc.push(...values.filter(v => v.kind === 'LAZY'));
              return acc;
            },
            [] as any[]
          );

          const expressionsToEvaluate = lazyDeps.map(v => unwrapNode(v.ex));
          const originalLazyExpressions = lazyDeps.map(v =>
            unwrapNode(v.originalEx)
          );

          let lazyValues: any[] = [];

          if (expressionsToEvaluate.length > 0) {
            const program = addCSSPreval(babel, path, expressionsToEvaluate);
            const { code } = generator(program);

            try {
              const evaluation = evaluate(code, state.filename);
              lazyValues = evaluation.value.__linariaPreval || [];
            } catch (error) {
              throw new Error(`Error evaluating:- \n${error.stack}\n`);
            }
          }

          const valueCache: ValueCache = new Map();
          originalLazyExpressions.forEach((key, idx) =>
            valueCache.set(key, lazyValues[idx])
          );

          state.queue.forEach(({ path }) => {
            if (processedPaths.has(path)) {
              // Do not process an expression
              // if it is referenced in one template more than once
              return;
            }

            processedPaths.add(path);

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
                const e = valueCache.entries();

                if (result.confident) {
                  cssText += String(result.value)
                    .replace(/[\r\n]+/g, ' ')
                    .trim();
                } else {
                  // Try to preval the value
                  if (
                    !(
                      t.isFunctionExpression(ex) ||
                      t.isArrowFunctionExpression(ex)
                    )
                  ) {
                    const value = valueCache.get(
                      ex.node as BabelTypes.Expression
                    );

                    if (value === '') {
                      return;
                    }

                    if (value && typeof value !== 'function') {
                      cssText += String(value)
                        .replace(/[\r\n]+/g, ' ')
                        .trim();

                      return;
                    }
                  }

                  throw ex.buildCodeFrameError(
                    `Expression ${generator(ex.node).code} cannot be evaluated`
                  );
                }
              }
            });

            const result = postcss([
              require('postcss-modules-sync').default({
                getJSON(json) {
                  state.classes = json;
                },
              }),
            ]).process(cssText, { from: state.filename });

            state.cssText = result.css;

            const classesDeclaration = t.objectExpression([
              ...Object.entries(state.classes)
                .filter(([name]) => name !== 'link')
                .map(([name, hash]) =>
                  t.objectProperty(t.identifier(name), t.stringLiteral(hash))
                ),
              // TODO change ast declaration to `template`
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
          });
        },
        exit(_, state) {
          Module.invalidate();
          state.file.metadata.css = {
            classes: state.classes,
            cssText: state.cssText,
          };
        },
      },
    },
  };
}

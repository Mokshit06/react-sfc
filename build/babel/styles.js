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

        const classesDeclaration = t.objectExpression(
          Object.entries(classes).map(([name, hash]) =>
            t.objectProperty(t.identifier(name), t.stringLiteral(hash))
          )
        );

        path.replaceWith(classesDeclaration);
      },
    },
  };
}

module.exports = styleTransform;

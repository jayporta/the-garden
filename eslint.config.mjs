import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import jsdoc from 'eslint-plugin-jsdoc';
import prettier from 'eslint-config-prettier/flat';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // AGENTS.md "Code Style" rules that a formatter cannot express. The purely
  // mechanical rules (indentation, semicolons, quotes) live in
  // prettier.config.mjs instead — see the `prettier` entry at the end.
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    plugins: { jsdoc },
    rules: {
      // "Every exported function/component gets a JSDoc block directly above
      // it (@param/@returns for non-trivial signatures)."
      'jsdoc/require-jsdoc': [
        'warn',
        {
          publicOnly: true,
          require: {
            ArrowFunctionExpression: true,
            FunctionDeclaration: true,
            FunctionExpression: true,
          },
        },
      ],
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-returns-description': 'warn',
      'jsdoc/check-alignment': 'warn',
      'jsdoc/check-param-names': 'warn',

      // "Every React component should be exported from its own file."
      'react/no-multi-comp': ['warn', { ignoreStateless: false }],

      // "Style with Tailwind utility classes, not inline `style` props."
      'react/forbid-dom-props': [
        'warn',
        {
          forbid: [
            {
              propName: 'style',
              message:
                'Use Tailwind utility classes instead of an inline style prop (AGENTS.md).',
            },
          ],
        },
      ],
      'react/forbid-component-props': [
        'warn',
        {
          forbid: [
            {
              propName: 'style',
              message:
                'Use Tailwind utility classes instead of an inline style prop (AGENTS.md).',
            },
          ],
        },
      ],
    },
  },

  // Config files are plain module exports; JSDoc on them adds nothing.
  {
    files: ['*.config.{js,mjs,ts}'],
    rules: { 'jsdoc/require-jsdoc': 'off' },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Prisma codegen output — never hand-edited, so linting it is noise.
    'app/generated/**',
    // Scratch files written by the Remember plugin; not project source.
    '.remember/**',
  ]),

  // MUST stay last: switches off every ESLint rule that would fight Prettier
  // over formatting, so the two tools never disagree about the same line.
  prettier,
]);

export default eslintConfig;

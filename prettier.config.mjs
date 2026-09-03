/**
 * Prettier configuration.
 *
 * Each option here encodes a bullet from the "Code Style" section of
 * AGENTS.md, which is the single source of truth for this repo's style.
 * If a rule changes there, change it here too — and vice versa.
 *
 * @type {import('prettier').Config}
 */
const config = {
  // "2-space indentation."
  tabWidth: 2,
  useTabs: false,
  // "Semicolons required."
  semi: true,
  // "Single quotes in JS/TS ('like this')..."
  singleQuote: true,
  // "...double quotes for JSX attributes (className="like-this")."
  jsxSingleQuote: false,
};

export default config;

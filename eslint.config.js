const js = require("@eslint/js");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const globals = require("globals");

module.exports = [
  { ignores: ["dist/**", "node_modules/**", "app.js", "vendor/**", "supabase/functions/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        // UMD globals loaded from index.html CDN script tags
        React: "readonly",
        ReactDOM: "readonly",
        // compile-time define injected by build.js / npm run dev
        __SHOW_DEMO__: "readonly",
        __EMBED_TEAM_DIRECTORY__: "readonly",
        __APP_VERSION__: "readonly",
      },
    },
    settings: { react: { version: "18.2" } },
    rules: {
      "react/jsx-uses-vars": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // THE RULE THAT WOULD HAVE CAUGHT THE OUTAGE.
      //
      // A hook's dependency array is evaluated during render, where the
      // enclosing function's `const`s are still in their temporal dead zone
      // until execution reaches them. app.jsx had
      //     useEffect(() => { loadAudit(); }, [nav, currentUser, loadAudit]);
      // 170 lines ABOVE `const loadAudit = useCallback(...)`, so every render
      // threw "Cannot access 'loadAudit' before initialization" and the whole
      // portal showed the ErrorBoundary instead of itself. It shipped because
      // nothing here objected: the tests exercise src/ modules and never mount
      // App, and the crash only happens in a browser.
      //
      // functions:false keeps hoisted `function` declarations legal (they are
      // genuinely safe, and the file relies on it); variables and classes are
      // the ones that throw.
      "no-use-before-define": ["error", {
        functions: false,
        variables: true,
        classes: true,
        allowNamedExports: false,
      }],
    },
  },
  {
    files: ["build.js", "scripts/**/*.js", "eslint.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node },
    },
  },
  {
    files: ["sw.js"],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];

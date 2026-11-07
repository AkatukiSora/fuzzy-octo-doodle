// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "**/next-env.d.ts", "eslint.config.mjs"] },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // any の明示・暗黙の伝播を禁止する
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": [
        "error",
        // node:test の test() は最上位で await しない前提の API
        { allowForKnownSafeCalls: [{ from: "package", package: "node:test", name: ["test"] }] },
      ],
    },
  },
  {
    files: ["backend/scripts/verify-friends.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      parserOptions: {
        ...tseslint.configs.disableTypeChecked.languageOptions?.parserOptions,
        project: false,
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        AbortSignal: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
      },
    },
  },
  {
    // backend だけに適用する。frontend は React / DOM の型の都合で、型の変換が必要になる場面が多い。
    files: ["backend/**/*.ts"],
    rules: {
      // 型アサーション（as / <T>）を禁止する。`as const` は許可される。
      // 型の変換が避けられない箇所だけ、理由を書いた eslint-disable-next-line で明示的に許可する。
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      // NestJS のモジュールは、デコレータだけを持つ空のクラスで定義する。
      "@typescript-eslint/no-extraneous-class": ["error", { allowWithDecorator: true }],
      // 実装を引き継ぐ skeleton の未使用の引数は、先頭に _ を付けて残す。
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);

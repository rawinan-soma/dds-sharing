import js from "@eslint/js";
import tseslint from "typescript-eslint";
import angular from "angular-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.angular/**",
      "**/src/paraglide/**",
      // Design reference bundle (docs/design_handoff_dds_sharing/README.md):
      // a prototype, not production code — its runtime is explicitly "do
      // not port", so it is not held to this repo's lint rules either.
      "**/design_handoff_dds_sharing/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["apps/web/src/**/*.ts"],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
  },
  {
    files: ["apps/web/src/**/*.html"],
    extends: [...angular.configs.templateRecommended],
  },
);

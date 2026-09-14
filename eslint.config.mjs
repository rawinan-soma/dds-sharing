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
      // The design tool's own prototype bundle (docs/design_handoff_dds_sharing/
      // README.md: "reference only; do not port") — vendored browser JS, not
      // project source, and not written to this repo's lint rules.
      "docs/design_handoff_dds_sharing/**",
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
  {
    // The environment holds deployment facts, validated once at boot
    // (ADR 0018, ticket #85) — everywhere else reads config through the
    // namespaced factories in apps/api/src/config, never process.env
    // directly. Excluded here: the schema/factory module itself, the
    // non-Nest entrypoints that validate their own env before connecting
    // (migration runner, Drizzle Kit config, host CLI scripts, the fake
    // upstream harness), and test code (which stands up its own database
    // connections against DATABASE_URL/APP_DATABASE_URL).
    files: ["apps/api/**/*.ts"],
    ignores: [
      "apps/api/src/config/**",
      "apps/api/src/db/migrate.ts",
      "apps/api/drizzle.config.ts",
      "apps/api/scripts/**",
      "apps/api/src/upstream/fake-harness/main.ts",
      "apps/api/**/*.spec.ts",
      "apps/api/**/*.e2e-spec.ts",
      "apps/api/test/**",
    ],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Read config through the validated namespaces in apps/api/src/config, not process.env directly (ADR 0018).",
        },
      ],
    },
  },
);

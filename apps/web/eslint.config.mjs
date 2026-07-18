import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Regras do React Compiler (eslint-plugin-react-hooks v6, trazidas pelo Next 16)
  // ficam como AVISO: sinalizam débito real (setState em effect, refs em render,
  // componentes criados em render), mas o codebase ainda não foi migrado e não
  // devem barrar o build. Limpeza gradual — não silenciar, só não bloquear.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);

export default eslintConfig;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
    ...nextVitals,
    {
        // Existing components intentionally hydrate state from localStorage and
        // keep imperative chess refs; these rules are not applicable here.
        rules: {
            "react-hooks/set-state-in-effect": "off",
            "react-hooks/refs": "off",
        },
    },
    globalIgnores([
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
        "public/stockfish/**",
    ]),
]);

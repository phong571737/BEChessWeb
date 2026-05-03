"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { en, type TranslationKeys } from "@/locales/en";
import { vi } from "@/locales/vi";

export type Locale = "en" | "vi";

const STORAGE_KEY = "ttlab:locale";
const DEFAULT_LOCALE: Locale = "vi";

const dicts: Record<Locale, Record<TranslationKeys, string>> = { en, vi };

// ── Context ──────────────────────────────────────────────────────
interface LangContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKeys, vars?: Record<string, string | number>) => string;
}

const LangContext = createContext<LangContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => en[key],
});

// ── Provider ─────────────────────────────────────────────────────
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Hydrate from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved === "en" || saved === "vi") setLocaleState(saved);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key: TranslationKeys, vars?: Record<string, string | number>): string => {
      let str = dicts[locale][key] ?? en[key] ?? (key as string);
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
        }
      }
      return str;
    },
    [locale]
  );

  return (
    <LangContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LangContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────
export function useT() {
  return useContext(LangContext);
}

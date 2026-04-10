"use client";

import React, { createContext, useContext } from "react";
import { en } from "@/locales/en";

interface TranslationContextType {
  t: (path: string, fallback?: string) => string;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export function TranslationProvider({ children }: { children: React.ReactNode }) {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

  const t = (path: string, fallback?: string): string => {
    const keys = path.split(".");
    let current: unknown = en;

    for (const key of keys) {
      if (!isRecord(current) || !(key in current)) {
        return fallback ?? path;
      }

      current = current[key];
    }
    
    return typeof current === "string" ? current : (fallback ?? path);
  };

  return (
    <TranslationContext.Provider value={{ t }}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(TranslationContext);
  if (context === undefined) {
    throw new Error("useTranslation must be used within a TranslationProvider");
  }
  return context;
}

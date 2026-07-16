"use client";

import { create } from "zustand";
import type { CompanyPayload, CompanyRecord } from "@/lib/companies/types";

interface CompaniesState {
  companies: CompanyRecord[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  loadCompanies: () => Promise<void>;
  createCompany: (payload: CompanyPayload) => Promise<CompanyRecord | null>;
  updateCompany: (id: string, payload: CompanyPayload) => Promise<CompanyRecord | null>;
  deleteCompany: (id: string) => Promise<CompanyActionResult | null>;
  bulkAction: (action: "activate" | "deactivate" | "delete", ids: string[]) => Promise<CompanyActionResult | null>;
  restoreCompanies: (ids: string[]) => Promise<boolean>;
}

type CompanyActionResult = { ids: string[]; undoUntil: string | null };

async function readJsonOrNull<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

export const useCompaniesStore = create<CompaniesState>((set) => ({
  companies: [],
  loading: true,
  saving: false,
  error: null,
  loadCompanies: async () => {
    set({ loading: true });
    try {
      const response = await fetch("/api/companies", { cache: "no-store" });
      const data = await readJsonOrNull<{ message?: string; companies?: CompanyRecord[] }>(response);
      if (!response.ok || !data) {
        throw new Error(data?.message ?? "Unable to load companies.");
      }

      set({ companies: data.companies ?? [], loading: false, error: null });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : "Unable to load companies." });
    }
  },
  createCompany: async (payload) => {
    set({ saving: true });
    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJsonOrNull<{ message?: string; company?: CompanyRecord }>(response);
      if (!response.ok || !data?.company) {
        throw new Error(data?.message ?? "Unable to create company.");
      }

      const company = data.company;
      set((state) => ({
        companies: [company, ...state.companies],
        saving: false,
        error: null,
      }));
      return company;
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : "Unable to create company." });
      return null;
    }
  },
  updateCompany: async (id, payload) => {
    set({ saving: true });
    try {
      const response = await fetch(`/api/companies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJsonOrNull<{ message?: string; company?: CompanyRecord }>(response);
      if (!response.ok || !data?.company) {
        throw new Error(data?.message ?? "Unable to update company.");
      }

      const company = data.company;
      set((state) => ({
        companies: state.companies.map((item) => (item.id === id ? company : item)),
        saving: false,
        error: null,
      }));
      return company;
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : "Unable to update company." });
      return null;
    }
  },
  deleteCompany: async (id) => {
    set({ saving: true });
    try {
      const response = await fetch(`/api/companies/${id}`, {
        method: "DELETE",
      });
      const data = await readJsonOrNull<{ message?: string; id?: string; undoUntil?: string | null }>(response);
      if (!response.ok || !data?.id) {
        throw new Error(data?.message ?? "Unable to delete company.");
      }

      set((state) => ({
        companies: state.companies.filter((item) => item.id !== id),
        saving: false,
        error: null,
      }));
      return { ids: [data.id], undoUntil: data.undoUntil ?? null };
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : "Unable to delete company." });
      return null;
    }
  },
  bulkAction: async (action, ids) => {
    set({ saving: true });
    try {
      const response = await fetch("/api/companies/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const data = await readJsonOrNull<{
        message?: string;
        ids?: string[];
        companies?: CompanyRecord[];
        undoUntil?: string | null;
      }>(response);

      if (!response.ok || !data) {
        throw new Error(data?.message ?? "Unable to process company action.");
      }

      set((state) => ({
        companies:
          action === "delete"
            ? state.companies.filter((item) => !(data.ids ?? []).includes(item.id))
            : (data.companies ?? state.companies),
        saving: false,
        error: null,
      }));

      return {
        ids: action === "delete" ? (data.ids ?? []) : ids,
        undoUntil: action === "delete" ? (data.undoUntil ?? null) : null,
      };
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : "Unable to process company action." });
      return null;
    }
  },
  restoreCompanies: async (ids) => {
    set({ saving: true });
    try {
      const response = await fetch("/api/companies/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await readJsonOrNull<{ message?: string; ids?: string[] }>(response);
      if (!response.ok || !data?.ids || data.ids.length === 0) {
        throw new Error(data?.message ?? "The company restore window has expired.");
      }

      const companiesResponse = await fetch("/api/companies", { cache: "no-store" });
      const companiesData = await readJsonOrNull<{ message?: string; companies?: CompanyRecord[] }>(companiesResponse);
      if (!companiesResponse.ok || !companiesData?.companies) {
        throw new Error(companiesData?.message ?? "Companies were restored but could not be refreshed.");
      }

      set({ companies: companiesData.companies, saving: false, error: null });
      return true;
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : "Unable to restore companies." });
      return false;
    }
  },
}));

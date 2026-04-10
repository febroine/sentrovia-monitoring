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
  deleteCompany: (id: string) => Promise<boolean>;
  bulkAction: (action: "activate" | "deactivate" | "delete", ids: string[]) => Promise<string[] | null>;
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
      const data = (await response.json()) as { message?: string; companies?: CompanyRecord[] };
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load companies.");
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
      const data = (await response.json()) as { message?: string; company?: CompanyRecord };
      if (!response.ok || !data.company) {
        throw new Error(data.message ?? "Unable to create company.");
      }

      set((state) => ({
        companies: [data.company!, ...state.companies],
        saving: false,
        error: null,
      }));
      return data.company;
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
      const data = (await response.json()) as { message?: string; company?: CompanyRecord };
      if (!response.ok || !data.company) {
        throw new Error(data.message ?? "Unable to update company.");
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
      const data = (await response.json()) as { message?: string; id?: string };
      if (!response.ok || !data.id) {
        throw new Error(data.message ?? "Unable to delete company.");
      }

      set((state) => ({
        companies: state.companies.filter((item) => item.id !== id),
        saving: false,
        error: null,
      }));
      return true;
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : "Unable to delete company." });
      return false;
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
      const data = (await response.json()) as {
        message?: string;
        ids?: string[];
        companies?: CompanyRecord[];
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to process company action.");
      }

      set((state) => ({
        companies:
          action === "delete"
            ? state.companies.filter((item) => !(data.ids ?? []).includes(item.id))
            : (data.companies ?? state.companies),
        saving: false,
        error: null,
      }));

      return action === "delete" ? (data.ids ?? []) : ids;
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : "Unable to process company action." });
      return null;
    }
  },
}));

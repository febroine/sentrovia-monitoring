import { afterEach, describe, expect, it, vi } from "vitest";
import type { CompanyPayload, CompanyRecord } from "@/lib/companies/types";
import { useCompaniesStore } from "@/stores/use-companies-store";

describe("companies store request ordering", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useCompaniesStore.setState({
      companies: [],
      loading: true,
      saving: false,
      error: null,
    });
  });

  it("does not let an older load overwrite the latest company catalog", async () => {
    const olderRequest = createPendingResponse();
    const olderCompany = { id: "company-old", name: "Old company" } as CompanyRecord;
    const latestCompany = { id: "company-latest", name: "Latest company" } as CompanyRecord;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => olderRequest.promise)
      .mockResolvedValueOnce(companyResponse(latestCompany)));

    const olderLoad = useCompaniesStore.getState().loadCompanies();
    await useCompaniesStore.getState().loadCompanies();
    olderRequest.resolve(companyResponse(olderCompany));
    await olderLoad;

    expect(useCompaniesStore.getState()).toMatchObject({
      companies: [latestCompany],
      loading: false,
      error: null,
    });
  });

  it("ignores a rejected older load after the latest load succeeds", async () => {
    const olderRequest = createPendingResponse();
    const latestCompany = { id: "company-latest", name: "Latest company" } as CompanyRecord;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => olderRequest.promise)
      .mockResolvedValueOnce(companyResponse(latestCompany)));

    const olderLoad = useCompaniesStore.getState().loadCompanies();
    await useCompaniesStore.getState().loadCompanies();
    olderRequest.reject(new Error("older request failed"));
    await olderLoad;

    expect(useCompaniesStore.getState()).toMatchObject({
      companies: [latestCompany],
      loading: false,
      error: null,
    });
  });

  it("does not let a load started before delete restore the deleted company", async () => {
    const olderRequest = createPendingResponse();
    const company = { id: "company-1", name: "Company" } as CompanyRecord;
    useCompaniesStore.setState({ companies: [company], loading: false });
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => olderRequest.promise)
      .mockResolvedValueOnce(Response.json({ id: company.id, undoUntil: null })));

    const olderLoad = useCompaniesStore.getState().loadCompanies();
    await useCompaniesStore.getState().deleteCompany(company.id);
    olderRequest.resolve(companyResponse(company));
    await olderLoad;

    expect(useCompaniesStore.getState()).toMatchObject({
      companies: [],
      loading: false,
      saving: false,
      error: null,
    });
  });

  it("invalidates a load started during delete when the mutation succeeds", async () => {
    const deleteRequest = createPendingResponse();
    const overlappingLoadRequest = createPendingResponse();
    const company = { id: "company-1", name: "Company" } as CompanyRecord;
    useCompaniesStore.setState({ companies: [company], loading: false });
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => deleteRequest.promise)
      .mockImplementationOnce(() => overlappingLoadRequest.promise));

    const deletion = useCompaniesStore.getState().deleteCompany(company.id);
    const overlappingLoad = useCompaniesStore.getState().loadCompanies();
    deleteRequest.resolve(Response.json({ id: company.id, undoUntil: null }));
    await deletion;

    expect(useCompaniesStore.getState()).toMatchObject({
      companies: [],
      loading: true,
      saving: false,
      error: null,
    });

    overlappingLoadRequest.resolve(companyResponse(company));
    await overlappingLoad;

    expect(useCompaniesStore.getState()).toMatchObject({
      companies: [],
      loading: false,
      saving: false,
      error: null,
    });
  });

  it("preserves a mutation error when an overlapping load resolves later", async () => {
    const createRequest = createPendingResponse();
    const overlappingLoadRequest = createPendingResponse();
    const staleCompany = { id: "company-stale", name: "Stale company" } as CompanyRecord;
    vi.stubGlobal("fetch", vi.fn()
      .mockImplementationOnce(() => createRequest.promise)
      .mockImplementationOnce(() => overlappingLoadRequest.promise));

    const create = useCompaniesStore.getState().createCompany({} as CompanyPayload);
    const overlappingLoad = useCompaniesStore.getState().loadCompanies();
    createRequest.resolve(Response.json({ message: "Create failed" }, { status: 500 }));
    await create;
    overlappingLoadRequest.resolve(companyResponse(staleCompany));
    await overlappingLoad;

    expect(useCompaniesStore.getState()).toMatchObject({
      companies: [],
      loading: false,
      saving: false,
      error: "Create failed",
    });
  });
});

function companyResponse(company: CompanyRecord) {
  return Response.json({ companies: [company] });
}

function createPendingResponse() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, reject, resolve };
}

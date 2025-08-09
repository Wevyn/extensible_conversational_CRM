import { POST } from "./route";

function createReq(body: any, cookies?: Record<string, string>) {
  return {
    async json() {
      return body;
    },
    cookies: {
      get: (k: string) =>
        cookies && cookies[k] ? { value: cookies[k] } : undefined,
    },
  } as any;
}

describe("/api/attio/sync POST", () => {
  const originalEnv = { ...process.env };
  const fetchSpy = vi.spyOn(global, "fetch" as any);

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    process.env.ATTIO_API_KEY = "test";
  });

  it("400 on invalid updates", async () => {
    const res: any = await POST(createReq({ updates: "nope" }));
    expect(res.status).toBe(400);
  });

  it("errors when missing ATTIO_API_KEY and no cookie", async () => {
    delete process.env.ATTIO_API_KEY;
    const res: any = await POST(createReq({ updates: [] }));
    expect(res.status).toBe(500);
  });

  it("uses cookie token if present", async () => {
    // mock companies getId, query, create
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: { object_id: "companiesId" } } }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: { object_id: "companiesId" } } }),
      } as any)
      .mockResolvedValueOnce({ json: async () => ({ data: [] }) } as any)
      .mockResolvedValueOnce({
        json: async () => ({ data: { id: { record_id: "c1" } } }),
      } as any);

    const res: any = await POST(
      createReq(
        { updates: [{ type: "company", name: "Acme" }] },
        { attio_token: "cookie-key" }
      )
    );
    expect(res.status).toBe(200);
  });

  it("creates company then deal and returns processed ids", async () => {
    // Sequence of fetch calls inside handler
    fetchSpy
      // getObjectIdBySlug("companies")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: { object_id: "companiesId" } } }),
      } as any)
      // queryRecordByAttribute -> getObjectIdBySlug("companies")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: { object_id: "companiesId" } } }),
      } as any)
      // POST records/query for companies
      .mockResolvedValueOnce({ json: async () => ({ data: [] }) } as any)
      // create company
      .mockResolvedValueOnce({
        json: async () => ({ data: { id: { record_id: "c1" } } }),
      } as any)
      // getObjectIdBySlug("deals")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: { object_id: "dealsId" } } }),
      } as any)
      // queryRecordByAttribute -> getObjectIdBySlug("deals")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: { object_id: "dealsId" } } }),
      } as any)
      // POST records/query for deals
      .mockResolvedValueOnce({ json: async () => ({ data: [] }) } as any)
      // create deal
      .mockResolvedValueOnce({
        json: async () => ({ data: { id: { record_id: "d1" } } }),
      } as any);

    const updates = [
      { type: "company", name: "Acme" },
      { type: "deal", name: "Acme - Pilot", company: "Acme", value: 1000 },
    ];
    const res: any = await POST(createReq({ updates }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.processed.companies["Acme"]).toBe("c1");
    expect(json.processed.deals["Acme - Pilot"]).toBe("d1");
  });
});

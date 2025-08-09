import { GET, POST, DELETE } from "./route";

function createReq(body?: any, cookies?: Record<string, string>) {
  return {
    async json() {
      return body ?? {};
    },
    cookies: {
      get: (k: string) =>
        cookies && cookies[k] ? { value: cookies[k] } : undefined,
    },
  } as any;
}

describe("/api/auth/attio", () => {
  const fetchSpy = vi.spyOn(global, "fetch" as any);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("GET returns linked false when no cookie", async () => {
    const res: any = await GET(createReq());
    const json = await res.json();
    expect(json.linked).toBe(false);
  });

  it("GET returns linked true when cookie present", async () => {
    const res: any = await GET(createReq({}, { attio_token: "abc" }));
    const json = await res.json();
    expect(json.linked).toBe(true);
  });

  it("POST validates token when validate=true", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true } as any);
    const res: any = await POST(createReq({ token: "abc", validate: true }));
    expect(res.status).toBe(200);
  });

  it("POST rejects invalid token", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false } as any);
    const res: any = await POST(createReq({ token: "bad", validate: true }));
    expect(res.status).toBe(401);
  });
});


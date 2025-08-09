import { POST } from "./route";

function createReq(body: any) {
  return {
    async json() {
      return body;
    },
  } as any;
}

describe("/api/parse POST", () => {
  const originalEnv = { ...process.env };
  const fetchSpy = vi.spyOn(global, "fetch" as any);

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  it("returns 400 on invalid body", async () => {
    const res = (await POST(createReq({}))) as any;
    expect(res.status).toBe(400);
  });

  it("returns [] when no keys configured", async () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const res: any = await POST(createReq({ text: "hello" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([]);
  });

  it("uses GROQ when GROQ_API_KEY is set and parses JSON array", async () => {
    process.env.GROQ_API_KEY = "test";
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: '```json\n[{"type":"person"}]\n```' } },
        ],
      }),
    } as any);
    const res: any = await POST(createReq({ text: "something" }));
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json[0].type).toBe("person");
  });

  it("falls back to OpenRouter when GROQ missing and OPENROUTER_API_KEY set", async () => {
    delete process.env.GROQ_API_KEY;
    process.env.OPENROUTER_API_KEY = "or_test";
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({
        choices: [{ message: { content: '[{"type":"deal"}]' } }],
      }),
    } as any);
    const res: any = await POST(createReq({ text: "something" }));
    const json = await res.json();
    expect(json[0].type).toBe("deal");
  });
});


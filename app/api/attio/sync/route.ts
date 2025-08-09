import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ATTIO_BASE = "https://api.attio.com/v2";

async function getObjectIdBySlug(slug: string, token: string) {
  const res = await fetch(`${ATTIO_BASE}/objects/${slug}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to get object ${slug}`);
  const json = await res.json();
  return json.data?.id?.object_id as string;
}

async function queryRecordByAttribute(
  objectSlug: string,
  attributeId: string,
  query: string,
  token: string
) {
  const objectId = await getObjectIdBySlug(objectSlug, token);
  const res = await fetch(`${ATTIO_BASE}/objects/${objectId}/records/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { and: [{ attribute: attributeId, query }] },
      limit: 1,
    }),
  });
  const json = await res.json();
  return json.data && json.data.length > 0 ? json.data[0] : null;
}

export async function POST(req: NextRequest) {
  try {
    const tokenFromCookie = (req as any)?.cookies?.get?.("attio_token")?.value;
    const token = tokenFromCookie || process.env.ATTIO_API_KEY;
    if (!token)
      return NextResponse.json(
        { error: "Missing ATTIO_API_KEY" },
        { status: 500 }
      );
    const { updates } = await req.json();
    if (!Array.isArray(updates))
      return NextResponse.json({ error: "Invalid updates" }, { status: 400 });

    // Minimal safe sync: companies -> people -> deals -> tasks
    // Workspace-specific attribute IDs should be provided via env/config in production.
    const ATTR = {
      people: {
        name: process.env.ATTIO_PEOPLE_NAME_ID || "name",
        email: process.env.ATTIO_PEOPLE_EMAIL_ID || "email_addresses",
        notes: process.env.ATTIO_PEOPLE_NOTES_ID || "notes",
      },
      companies: {
        name: process.env.ATTIO_COMPANY_NAME_ID || "name",
      },
      deals: {
        name: process.env.ATTIO_DEAL_NAME_ID || "name",
        value: process.env.ATTIO_DEAL_VALUE_ID || "value",
        close_date: process.env.ATTIO_DEAL_CLOSE_DATE_ID || "close_date",
        stage: process.env.ATTIO_DEAL_STAGE_ID || "stage",
      },
    };

    const processed: any = { companies: {}, people: {}, deals: {} };

    const companyUpdates = updates.filter((u: any) => u.type === "company");
    const personUpdates = updates.filter((u: any) => u.type === "person");
    const dealUpdates = updates.filter((u: any) => u.type === "deal");
    const taskUpdates = updates.filter((u: any) => u.type === "task");

    // Companies
    for (const c of companyUpdates) {
      const companiesId = await getObjectIdBySlug("companies", token);
      const values: any = {};
      if (ATTR.companies.name) values[ATTR.companies.name] = c.name;
      const payload = { data: { values } };
      const existing = await queryRecordByAttribute(
        "companies",
        ATTR.companies.name,
        c.name,
        token
      );
      if (existing) {
        const res = await fetch(
          `${ATTIO_BASE}/objects/${companiesId}/records/${existing.id.record_id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );
        await res.json();
        processed.companies[c.name] = existing.id.record_id;
      } else {
        const res = await fetch(
          `${ATTIO_BASE}/objects/${companiesId}/records`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );
        const json = await res.json();
        processed.companies[c.name] = json.data?.id?.record_id;
      }
    }

    // People (email-first)
    for (const p of personUpdates) {
      const peopleId = await getObjectIdBySlug("people", token);
      const values: any = {};
      if (ATTR.people.name && (p.first_name || p.last_name || p.name)) {
        const full =
          `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.name;
        values[ATTR.people.name] = [
          {
            first_name: p.first_name || "Unknown",
            last_name: p.last_name || "",
            full_name: full,
          },
        ];
      }
      if (p.email && ATTR.people.email)
        values[ATTR.people.email] = [{ email_address: p.email }];
      if (p.notes && ATTR.people.notes) values[ATTR.people.notes] = p.notes;
      const payload = { data: { values } };

      let existing = null;
      if (p.email && ATTR.people.email)
        existing = await queryRecordByAttribute(
          "people",
          ATTR.people.email,
          p.email,
          token
        );
      if (!existing && p.name && ATTR.people.name)
        existing = await queryRecordByAttribute(
          "people",
          ATTR.people.name,
          p.name,
          token
        );

      if (existing) {
        const res = await fetch(
          `${ATTIO_BASE}/objects/${peopleId}/records/${existing.id.record_id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );
        await res.json();
        processed.people[p.name] = existing.id.record_id;
      } else {
        const res = await fetch(`${ATTIO_BASE}/objects/${peopleId}/records`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        processed.people[p.name] = json.data?.id?.record_id;
      }
    }

    // Deals (minimal)
    for (const d of dealUpdates) {
      const dealsId = await getObjectIdBySlug("deals", token);
      const values: any = {};
      if (ATTR.deals.name) values[ATTR.deals.name] = d.name;
      if (d.value && ATTR.deals.value)
        values[ATTR.deals.value] = Number(
          String(d.value).replace(/[,\$]/g, "")
        );
      if (d.close_date && ATTR.deals.close_date)
        values[ATTR.deals.close_date] = new Date(d.close_date).toISOString();
      if (d.stage && ATTR.deals.stage) values[ATTR.deals.stage] = d.stage; // Assume parser normalized stage
      const payload: any = { data: { values } };
      if (d.company && processed.companies[d.company]) {
        payload.data.linked_records = [
          {
            target_object: "companies",
            target_record_id: processed.companies[d.company],
          },
        ];
      }
      const existing = await queryRecordByAttribute(
        "deals",
        ATTR.deals.name,
        d.name,
        token
      );
      if (existing) {
        const res = await fetch(
          `${ATTIO_BASE}/objects/${dealsId}/records/${existing.id.record_id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );
        await res.json();
        processed.deals[d.name] = existing.id.record_id;
      } else {
        const res = await fetch(`${ATTIO_BASE}/objects/${dealsId}/records`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        processed.deals[d.name] = json.data?.id?.record_id;
      }
    }

    // Tasks (basic create)
    for (const t of taskUpdates) {
      const payload: any = {
        data: {
          content: t.description || t.name || "Task",
          format: "plaintext",
          deadline_at: t.due_date ? new Date(t.due_date).toISOString() : null,
          is_completed: false,
          assignees: t.assignees || [],
        },
      };
      const linkedRecords: any[] = [];
      if (t.link_to_person_name && processed.people[t.link_to_person_name])
        linkedRecords.push({
          target_object: "people",
          target_record_id: processed.people[t.link_to_person_name],
        });
      if (t.link_to_company && processed.companies[t.link_to_company])
        linkedRecords.push({
          target_object: "companies",
          target_record_id: processed.companies[t.link_to_company],
        });
      if (t.link_to_deal && processed.deals[t.link_to_deal])
        linkedRecords.push({
          target_object: "deals",
          target_record_id: processed.deals[t.link_to_deal],
        });
      if (linkedRecords.length) payload.data.linked_records = linkedRecords;
      await fetch(`${ATTIO_BASE}/tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    }

    return NextResponse.json({ ok: true, processed });
  } catch (e) {
    return NextResponse.json({ error: "Attio sync failed" }, { status: 500 });
  }
}

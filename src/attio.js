// attio.js
const ATTIO_API_BASE = "https://api.attio.com/v2";
const BEARER_TOKEN = "Bearer e01cca9d5d70d62535755e3f1609118082790728f8c98dbd0b3f9cce1aae3f53";

const objectCache = {}; // caches object_ids like "people"
const attributeCache = {}; // caches attribute mappings

// You'll need to get these from your Attio workspace
const ATTRIBUTE_IDS = {
  name: "3a2d79ac-1c54-4d1d-9bd1-df92ba80052f",
  email: "4ab52dd0-edfe-4eea-b73c-561028076ea6", // You'll need to find this ID
  phone: "57e614f6-a910-4df8-a7a5-f175d85a8825", // You'll need to find this ID
  notes: "168ddd0a-6dc6-4aff-8939-60dcfe1cdf41"  // You'll need to find this ID
};


async function sendToAttio(updates) {
  console.log('🔄 Processing updates:', updates);
  
  // Group updates by person to handle linking
  const personUpdates = updates.filter(item => item.type === "person");
  const taskUpdates = updates.filter(item => item.type === "task");
  
  const processedPersons = {};
  
  // Process persons first
  for (const item of personUpdates) {
    try {
      ensureFields(item);
      const personId = await upsertPerson(item);
      processedPersons[item.name] = personId;
    } catch (err) {
      console.error("❌ Failed to process person:", item, err);
    }
  }
  
  // Process tasks and link to persons
  for (const item of taskUpdates) {
    try {
      ensureFields(item);
      
      // Find the person to link to
      let linkedPersonId = null;
      if (item.link_to_person_name) {
        linkedPersonId = processedPersons[item.link_to_person_name];
        if (!linkedPersonId) {
          // Try to find existing person
          const existingPerson = await queryPersonByName(item.link_to_person_name);
          linkedPersonId = existingPerson?.id?.record_id;
        }
      }
      
      await upsertTask(item, linkedPersonId);
    } catch (err) {
      console.error("❌ Failed to process task:", item, err);
    }
  }
}

function ensureFields(item) {
  if (item.type === "person") {
    item.name = item.name || "Unknown";
    item.notes = item.notes || "";

    const [first, ...rest] = item.name.split(" ");
    item.first_name = item.first_name || first || "Unknown";
    item.last_name = item.last_name || rest.join(" ") || "";
  }

  if (item.type === "task") {
    item.description = item.description || item.name || "Untitled task";
    item.due_date = parseDateTime(item.due_date, item.due_time);
  }
}

function parseDateTime(date, time) {
  try {
    let d = new Date();
    
    if (date?.toLowerCase().includes("tomorrow")) {
      d.setDate(d.getDate() + 1);
    } else if (date?.toLowerCase().includes("next week")) {
      d.setDate(d.getDate() + 7);
    } else if (Date.parse(date)) {
      d = new Date(date);
    }

    if (time) {
      const [t, mer] = time.split(" ");
      let [h, m] = t.split(":").map(Number);
      if (mer?.includes("p") && h < 12) h += 12;
      if (mer?.includes("a") && h === 12) h = 0;
      d.setHours(h || 0, m || 0, 0, 0);
    }

    return d.toISOString();
  } catch {
    // Default to next week
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString();
  }
}

async function getObjectIdBySlug(slug) {
  if (objectCache[slug]) return objectCache[slug];

  const res = await fetch(`${ATTIO_API_BASE}/objects/${slug}`, {
    headers: { Authorization: BEARER_TOKEN }
  });

  if (!res.ok) {
    throw new Error(`Failed to get object ${slug}: ${res.status}`);
  }

  const json = await res.json();
  const id = json.data?.id?.object_id;

  if (!id) throw new Error(`❌ Cannot resolve object slug: ${slug}`);

  objectCache[slug] = id;
  return id;
}

// ========== PERSONS ==========

async function upsertPerson(data) {
  console.log('🔄 Upserting person:', data.name);
  
  // First, try to find existing person
  const existingPerson = await queryPersonByName(data.name);
  
  if (existingPerson) {
    console.log('👤 Found existing person, updating:', existingPerson.id.record_id);
    return await updatePerson(existingPerson.id.record_id, data);
  } else {
    console.log('👤 Creating new person:', data.name);
    return await createPerson(data);
  }
}

async function createPerson(data) {
  const peopleId = await getObjectIdBySlug("people");
  const fullName = `${data.first_name || ""} ${data.last_name || ""}`.trim();

  const values = {
    [ATTRIBUTE_IDS.name]: [{
      first_name: data.first_name || "Unknown",
      last_name: data.last_name || "",
      full_name: fullName
    }]
  };

  // Add email if provided
  if (data.email && ATTRIBUTE_IDS.email) {
    values[ATTRIBUTE_IDS.email] = [{ email_address: data.email }];
  }

  // Add phone if provided
  if (data.phone && ATTRIBUTE_IDS.phone) {
    values[ATTRIBUTE_IDS.phone] = [{ phone_number: data.phone }];
  }

  // Add notes if provided
  if (data.notes && ATTRIBUTE_IDS.notes) {
    values[ATTRIBUTE_IDS.notes] = data.notes;
  }

  const payload = JSON.stringify({ data: { values } });

  const res = await fetch(`${ATTIO_API_BASE}/objects/${peopleId}/records`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: payload
  });

  const json = await res.json();
  if (!res.ok) {
    console.error("❌ Person creation error:", json);
    throw new Error(`Failed to create person: ${JSON.stringify(json)}`);
  } else {
    console.log("✅ Person created:", json.data?.id?.record_id);
  }

  return json.data?.id?.record_id;
}

async function updatePerson(recordId, data) {
  const peopleId = await getObjectIdBySlug("people");
  
  const values = {};
  
  // Update name if provided
  if (data.first_name || data.last_name) {
    const fullName = `${data.first_name || ""} ${data.last_name || ""}`.trim();
    values[ATTRIBUTE_IDS.name] = [{
      first_name: data.first_name || "Unknown",
      last_name: data.last_name || "",
      full_name: fullName
    }];
  }

  // Update email if provided
  if (data.email && ATTRIBUTE_IDS.email) {
    values[ATTRIBUTE_IDS.email] = [{ email_address: data.email }];
  }

  // Update phone if provided
  if (data.phone && ATTRIBUTE_IDS.phone) {
    values[ATTRIBUTE_IDS.phone] = [{ phone_number: data.phone }];
  }

  // Update notes if provided (append to existing notes)
  if (data.notes && ATTRIBUTE_IDS.notes) {
    values[ATTRIBUTE_IDS.notes] = data.notes;
  }

  if (Object.keys(values).length === 0) {
    console.log('ℹ️ No updates needed for person');
    return recordId;
  }

  const payload = JSON.stringify({ data: { values } });

  const res = await fetch(`${ATTIO_API_BASE}/objects/${peopleId}/records/${recordId}`, {
    method: "PATCH",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: payload
  });

  const json = await res.json();
  if (!res.ok) {
    console.error("❌ Person update error:", json);
    throw new Error(`Failed to update person: ${JSON.stringify(json)}`);
  } else {
    console.log("✅ Person updated:", recordId);
  }

  return recordId;
}

async function queryPersonByName(name) {
  const peopleId = await getObjectIdBySlug("people");

  // Try exact match first
  let payload = {
    filter: {
      and: [{
        attribute: ATTRIBUTE_IDS.name,
        query: name
      }]
    },
    limit: 1
  };

  let res = await fetch(`${ATTIO_API_BASE}/objects/${peopleId}/records/query`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  let json = await res.json();
  
  if (json.data && json.data.length > 0) {
    return json.data[0];
  }

  // Try fuzzy search if exact match fails
  const [firstName, lastName] = name.split(" ");
  if (firstName) {
    payload = {
      filter: {
        and: [{
          attribute: ATTRIBUTE_IDS.name,
          query: firstName
        }]
      },
      limit: 5
    };

    res = await fetch(`${ATTIO_API_BASE}/objects/${peopleId}/records/query`, {
      method: "POST",
      headers: {
        Authorization: BEARER_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    json = await res.json();
    
    // Look for best match
    if (json.data && json.data.length > 0) {
      for (const person of json.data) {
        const personName = person.values[ATTRIBUTE_IDS.name]?.[0]?.full_name?.toLowerCase();
        if (personName?.includes(name.toLowerCase())) {
          return person;
        }
      }
    }
  }

  return null;
}

// ========== TASKS ==========

async function upsertTask(data, linkedPersonId = null) {
  console.log('📋 Creating task:', data.description);
  
  const taskContent = data.description;
  
  const payload = {
    data: {
      content: taskContent,
      format: "plaintext",
      deadline_at: data.due_date,
      is_completed: false,
      assignees: []
    }
  };

  // Link to person if we have an ID
  if (linkedPersonId) {
    payload.data.linked_records = [{
      target_object: "people",
      target_record_id: linkedPersonId
    }];
  }

  console.log("📦 Task payload:", JSON.stringify(payload, null, 2));

  const res = await fetch(`${ATTIO_API_BASE}/tasks`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (res.ok) {
    console.log("✅ Task created:", json.data?.id);
    return json.data?.id;
  } else {
    console.error("❌ Task creation failed:", json);
    throw new Error(`Failed to create task: ${JSON.stringify(json)}`);
  }
}

// ========== UTILITY FUNCTIONS ==========

async function getAttributeIds(objectSlug) {
  if (attributeCache[objectSlug]) return attributeCache[objectSlug];

  const objectId = await getObjectIdBySlug(objectSlug);
  const res = await fetch(`${ATTIO_API_BASE}/objects/${objectId}/attributes`, {
    headers: { Authorization: BEARER_TOKEN }
  });

  const json = await res.json();
  const attributes = {};
  
  if (json.data) {
    json.data.forEach(attr => {
      attributes[attr.api_slug] = attr.id.attribute_id;
    });
  }

  attributeCache[objectSlug] = attributes;
  console.log(`📋 Cached attributes for ${objectSlug}:`, attributes);
  return attributes;
}

// Call this once to populate your attribute IDs
async function initializeAttributeIds() {
  try {
    const peopleAttributes = await getAttributeIds('people');
    console.log('People attributes:', peopleAttributes);
    
    // Update ATTRIBUTE_IDS with actual values
    ATTRIBUTE_IDS.email = peopleAttributes.email_addresses;
    ATTRIBUTE_IDS.phone = peopleAttributes.phone_numbers;
    ATTRIBUTE_IDS.notes = peopleAttributes.notes;
    
    console.log('✅ Attribute IDs initialized');
  } catch (err) {
    console.error('❌ Failed to initialize attribute IDs:', err);
  }
}

export { sendToAttio, initializeAttributeIds };
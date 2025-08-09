// advanced-attio.js - Enhanced CRM with deal intelligence and relationship mapping
const ATTIO_API_BASE = "https://api.attio.com/v2";
const BEARER_TOKEN = process.env.REACT_APP_ATTIO_DUMMY || "Bearer <REDACTED>";

const objectCache = {};
const attributeCache = {};
const validStagesCache = {}; // Cache for valid stage options

// Enhanced attribute mappings for advanced features
const ATTRIBUTE_IDS = {
  // People attributes
  name: "<REDACTED_NAME_ID>",
  email: "<REDACTED_EMAIL_ID>",
  phone: "<REDACTED_PHONE_ID>",
  notes: "<REDACTED_NOTES_ID>",
  role: "4bb82d05-40dc-49d1-a033-7451290ce027",
  sentiment: "26ad2c8d-1bfe-48b0-ab9a-8a26c9ff5cab",
  department: "2bdd1ea8-2983-49a4-8570-de7bd4c037a5", // Add department field
  employee_id: "6ab0bbc9-4eba-4f4a-9ee2-f6c19ea9948a", // For internal employees
  manager: "bd699e5b-79d5-4745-9f24-75a23d6cdfdf", // Employee manager relationship

  // Deal attributes
  deal_name: "<REDACTED_DEAL_NAME_ID>",
  deal_value: "<REDACTED_DEAL_VALUE_ID>",
  close_date: "<REDACTED_CLOSE_DATE_ID>",
  stage: "<REDACTED_STAGE_ID>",
  probability: "515599b4-63dd-4084-b704-df5fccb81a16",
  competitors: "5f41c718-9fd3-4a16-84fc-ca8c2e97fa49",
  decision_maker: "25ee890c-4306-4b25-8364-2341f52c4184",
  pain_points: "abc75e84-5ebd-4fcb-a0f6-e3f1110dba4c",
  deal_owner: "3b616cdc-1714-4db7-b99a-1007103ed6cf",
  internal_stakeholders: "944fe8e7-a984-4da2-af86-f51c4ada7541", // For employee-employee deals

  // Company attributes
  company_name: "<REDACTED_COMPANY_NAME_ID>",
  relationship_health: "a73d90c1-495c-488a-87ee-46bdbfa40905",
  expansion_opportunity: "1c2d7097-a3d8-45ed-a751-3c2d4c4dd8a4",
  churn_risk: "cf45e420-3fdf-4837-8aa5-97d56b7d9848",
  internal_department: "3c8bfbe9-9261-458f-a499-254582e5469f", // For internal departments
  // User attributes
  user_person: "2aea9c22-ab6b-485d-9846-760c50651684", // Relationship to person
  user_id: "babd4ce9-e33b-463a-828f-e94213280e7b", // User ID (same as person's record_id)
  user_email: "7b008926-28d2-44c1-af08-1700251db9da", // Primary email for user
};

// Deal stage mapping based on language patterns
const DEAL_STAGES = {
  Lead: [
    "lead",
    "qualified",
    "first call",
    "initial discussion",
    "introduction",
    "prospect",
  ],
  "In Progress": [
    "in progress",
    "discovery",
    "demo",
    "demonstration",
    "presentation",
    "proposal",
    "negotiation",
    "contract",
    "terms",
  ],
  Won: ["won", "closed won", "signed", "closed", "deal done", "approved"],
  Lost: [
    "lost",
    "closed lost",
    "went with",
    "chose",
    "not moving forward",
    "lost to",
  ],
};

// Team/Role indicators that should NOT be created as people
const TEAM_ROLE_INDICATORS = [
  "team",
  "department",
  "group",
  "division",
  "unit",
  "committee",
  "board",
  "panel",
  "squad",
  "crew",
  "staff",
  "workforce",
];

// Function to get valid stage options from Attio
async function getValidStageOptions() {
  if (validStagesCache.stages && validStagesCache.stages.length > 0) {
    console.log("🔄 Using cached stages:", validStagesCache.stages);
    return validStagesCache.stages;
  }

  try {
    const dealsId = await getObjectIdBySlug("deals");
    const stageAttributeId = "6fbebe44-2dfe-4ef4-b524-e196de38ede3";

    console.log(
      `🔍 Loading stage options for deals:${dealsId}, attribute:${stageAttributeId}`
    );

    const res = await fetch(
      `${ATTIO_API_BASE}/objects/${dealsId}/attributes/${stageAttributeId}`,
      {
        headers: { Authorization: BEARER_TOKEN },
      }
    );

    if (res.ok) {
      const json = await res.json();
      console.log("📋 Stage attribute response:", json);

      const options =
        json.data?.config?.options ||
        json.data?.options ||
        json.config?.options ||
        [];

      if (options && options.length > 0) {
        validStagesCache.stages = options.map((option) => ({
          id: option.id || option.value,
          title: option.title || option.label || option.name,
        }));
        console.log(
          "✅ Valid stage options loaded from Attio:",
          validStagesCache.stages
        );
        return validStagesCache.stages;
      }
    } else {
      console.error("❌ Failed to fetch stage attribute:", res.status);
    }
  } catch (err) {
    console.error("❌ Failed to load stage options:", err);
  }

  // Use your actual Attio stages with real IDs
  console.log("⚠️ Using actual Attio stage IDs");
  validStagesCache.stages = [
    { id: "f35a5f1b-5558-4f56-971c-c9e9cae43a59", title: "Lead" },
    { id: "78c45eff-9ddf-4635-b177-473c1b1eb993", title: "In Progress" },
    { id: "2976ec08-c2b1-4e38-9d43-659e7050a937", title: "Won" },
    { id: "8af40582-e196-4abf-b373-a9f4dcb0674d", title: "Lost" },
  ];

  return validStagesCache.stages;
}

// Function to map stage name to valid Attio stage
// Fixed stage mapping function - replace the existing mapToValidStage function
async function mapToValidStage(stageInput) {
  if (!stageInput) return null;

  const validStages = await getValidStageOptions();
  const lowerInput = stageInput.toLowerCase().trim();

  console.log(
    `🎯 Mapping stage "${stageInput}" against valid stages:`,
    validStages.map((s) => s.title)
  );

  // 1. EXACT MATCH (case insensitive) - this should catch "Demo" -> "Demo"
  const exactMatch = validStages.find(
    (stage) => stage.title.toLowerCase() === lowerInput
  );
  if (exactMatch) {
    console.log(
      `✅ Exact stage match: "${exactMatch.title}" -> ID: ${exactMatch.id}`
    );
    return exactMatch;
  }

  // 2. PARTIAL MATCH - check if input contains stage name or vice versa
  const partialMatch = validStages.find((stage) => {
    const stageTitle = stage.title.toLowerCase();
    return stageTitle.includes(lowerInput) || lowerInput.includes(stageTitle);
  });
  if (partialMatch) {
    console.log(
      `✅ Partial stage match: "${stageInput}" -> "${partialMatch.title}"`
    );
    return partialMatch;
  }

  // 3. FUZZY MATCH using DEAL_STAGES patterns
  for (const [validStageTitle, indicators] of Object.entries(DEAL_STAGES)) {
    if (indicators.some((ind) => lowerInput.includes(ind.toLowerCase()))) {
      const fuzzyMatch = validStages.find(
        (stage) => stage.title.toLowerCase() === validStageTitle.toLowerCase()
      );
      if (fuzzyMatch) {
        console.log(
          `✅ Fuzzy match found: "${stageInput}" -> "${fuzzyMatch.title}" via "${validStageTitle}"`
        );
        return fuzzyMatch;
      }
    }
  }

  // 4. DEFAULT FALLBACK
  const fallback = validStages.find(
    (stage) =>
      stage.title.toLowerCase().includes("discovery") ||
      stage.title.toLowerCase().includes("qualified")
  );
  if (fallback) {
    console.log(`⚠️ Using fallback stage: "${fallback.title}"`);
    return fallback;
  }

  console.log(`❌ No valid stage found for "${stageInput}"`);
  return null;
}

// Check if a name represents a team/role rather than an individual person
function isTeamOrRole(name) {
  if (!name || typeof name !== "string") return false;

  const lowerName = name.toLowerCase().trim();

  // Check for team indicators
  const hasTeamIndicator = TEAM_ROLE_INDICATORS.some((indicator) =>
    lowerName.includes(indicator)
  );

  // Check for standalone role titles
  const roleOnlyTitles = [
    "cto",
    "ceo",
    "cfo",
    "cmo",
    "coo",
    "cpo",
    "ciso",
    "vp",
    "director",
    "manager",
    "lead",
    "head",
    "president",
    "founder",
    "owner",
  ];

  const isRoleOnly = roleOnlyTitles.includes(lowerName);

  return hasTeamIndicator || isRoleOnly;
}

async function sendToAttio(updates) {
  console.log("🔄 Processing advanced updates:", updates);

  // Filter out team/role entries from person creation
  const filteredUpdates = updates.filter((item) => {
    if (item.type === "person" && isTeamOrRole(item.name)) {
      console.log(`🚫 Skipping team/role as person: "${item.name}"`);
      return false;
    }
    return true;
  });

  // Process in order: companies -> people -> deals -> tasks
  const companyUpdates = filteredUpdates.filter(
    (item) => item.type === "company"
  );
  const personUpdates = filteredUpdates.filter(
    (item) => item.type === "person"
  );
  const dealUpdates = filteredUpdates.filter((item) => item.type === "deal");
  const taskUpdates = filteredUpdates.filter((item) => item.type === "task");
  const relationshipUpdates = filteredUpdates.filter(
    (item) => item.type === "relationship"
  );

  const processedEntities = {
    companies: {},
    people: {},
    deals: {},
  };

  // Process companies first
  for (const item of companyUpdates) {
    try {
      const companyId = await upsertCompany(item);
      processedEntities.companies[item.name] = companyId;
    } catch (err) {
      console.error("❌ Failed to process company:", item, err);
    }
  }

  // Process people with enhanced duplicate detection
  for (const item of personUpdates) {
    try {
      const personId = await upsertPersonEnhanced(item);
      processedEntities.people[item.name] = personId;

      // Link to company if specified
      if (item.company && processedEntities.companies[item.company]) {
        await linkPersonToCompany(
          personId,
          processedEntities.companies[item.company]
        );
      }
    } catch (err) {
      console.error("❌ Failed to process person:", item, err);
    }
  }

  // Process deals with enhanced linking
  for (const item of dealUpdates) {
    try {
      const dealId = await upsertDealEnhanced(item, processedEntities);
      processedEntities.deals[item.name] = dealId;
    } catch (err) {
      console.error("❌ Failed to process deal:", item, err);
    }
  }

  // Process relationship updates
  for (const item of relationshipUpdates) {
    try {
      await updateRelationships(item, processedEntities);
    } catch (err) {
      console.error("❌ Failed to process relationship:", item, err);
    }
  }

  // Process tasks with enhanced linking
  for (const item of taskUpdates) {
    try {
      await upsertAdvancedTask(item, processedEntities);
    } catch (err) {
      console.error("❌ Failed to process task:", item, err);
    }
  }
}

// ========== ENHANCED PERSON MANAGEMENT ==========

async function upsertPersonEnhanced(data) {
  console.log("👤 Enhanced upserting person:", data.name);

  // Enhanced search - try email first, then name variations
  let existing = null;

  // Search by email if provided
  if (data.email) {
    existing = await queryPersonByEmail(data.email);
    if (existing) {
      console.log(`✅ Found existing person by email: ${data.email}`);
    }
  }

  // Search by name variations if not found by email
  if (!existing) {
    existing = await queryPersonByNameEnhanced(data.name);
  }

  if (existing) {
    return await updatePersonWithSentiment(existing.id.record_id, data);
  } else {
    const personId = await createPersonWithSentiment(data);
    await createUserForPerson(data, personId);
    return personId;
  }
}
// Fixed createUserForPerson function
// Fixed createUserForPerson function
// Fixed createUserForPerson function
async function createUserForPerson(personData, personRecordId) {
  console.log("👤 Creating user for person:", personData.name);
  console.log("📨 Email:", personData.email);
  console.log("🆔 Person Record ID:", personRecordId);

  if (!personData.email || !personRecordId) {
    console.error("Missing email or person record ID");
    return;
  }

  // Custom attributes - only set what exists on Users object
  const values = {
    [ATTRIBUTE_IDS.user_id]: personRecordId, // Link user to person via user_id field
  };

  if (ATTRIBUTE_IDS.user_email) {
    values[ATTRIBUTE_IDS.user_email] = [{ email_address: personData.email }];
  }

  // The key relationship - link to person record (this should make the name display)
  const linked_records = [
    {
      target_object: "people",
      target_record_id: personRecordId,
      attribute_id: ATTRIBUTE_IDS.user_person, // This links user to person and should display person's name
    },
  ];

  const payload = {
    data: {
      primary_email_address: personData.email, // This is a system field
      values, // Custom attributes
      linked_records, // Relationships
    },
  };

  try {
    const response = await fetch(
      "https://api.attio.com/v2/objects/67f9b7bf-eaa3-4e05-8a05-eab58cc288cd/records",
      {
        method: "POST",
        headers: {
          Authorization:
            "Bearer e01cca9d5d70d62535755e3f1609118082790728f8c98dbd0b3f9cce1aae3f53",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error(
        "❌ Full error response:",
        JSON.stringify(errorData, null, 2)
      );
      throw new Error(`Failed to create user: ${JSON.stringify(errorData)}`);
    }

    const responseData = await response.json();
    console.log("✅ User created:", responseData);
    return responseData.data.id.record_id; // Return the user record ID
  } catch (error) {
    console.error("❌ Failed to create user:", error.message);
    throw error;
  }
}

async function queryPersonByEmail(email) {
  const peopleId = await getObjectIdBySlug("people");

  const payload = {
    filter: {
      and: [
        {
          attribute: ATTRIBUTE_IDS.email,
          query: email,
        },
      ],
    },
    limit: 1,
  };

  const res = await fetch(
    `${ATTIO_API_BASE}/objects/${peopleId}/records/query`,
    {
      method: "POST",
      headers: {
        Authorization: BEARER_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const json = await res.json();
  return json.data && json.data.length > 0 ? json.data[0] : null;
}

async function queryPersonByNameEnhanced(name) {
  const peopleId = await getObjectIdBySlug("people");

  // Try exact match first
  let payload = {
    filter: {
      and: [
        {
          attribute: ATTRIBUTE_IDS.name,
          query: name,
          query_mode: "exact_match",
        },
      ],
    },
    limit: 1,
  };

  let res = await fetch(`${ATTIO_API_BASE}/objects/${peopleId}/records/query`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let json = await res.json();
  if (json.data && json.data.length > 0) {
    console.log(`✅ Found exact name match: ${name}`);
    return json.data[0];
  }

  // Try fuzzy search
  payload.filter.and[0].query_mode = "contains";

  res = await fetch(`${ATTIO_API_BASE}/objects/${peopleId}/records/query`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  json = await res.json();
  if (json.data && json.data.length > 0) {
    // Check if it's a close match
    const existing = json.data[0];
    const existingName =
      existing.values?.[ATTRIBUTE_IDS.name]?.[0]?.full_name || "";

    if (namesAreSimilar(name, existingName)) {
      console.log(
        `✅ Found similar name match: "${name}" -> "${existingName}"`
      );
      return existing;
    }
  }

  return null;
}

function namesAreSimilar(name1, name2) {
  if (!name1 || !name2) return false;

  const normalize = (str) =>
    str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, "");
  const n1 = normalize(name1);
  const n2 = normalize(name2);

  // Exact match
  if (n1 === n2) return true;

  // Check if one is contained in the other (for partial names)
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Check word overlap for compound names
  const words1 = n1.split(/\s+/);
  const words2 = n2.split(/\s+/);
  const overlap = words1.filter((word) => words2.includes(word));

  // Consider similar if significant word overlap
  return overlap.length >= Math.min(words1.length, words2.length) * 0.5;
}

async function createPersonWithSentiment(data) {
  const peopleId = await getObjectIdBySlug("people");
  const fullName = `${data.first_name || ""} ${data.last_name || ""}`.trim();

  const values = {
    [ATTRIBUTE_IDS.name]: [
      {
        first_name: data.first_name || "Unknown",
        last_name: data.last_name || "",
        full_name: fullName,
      },
    ],
  };

  // Enhanced attributes with role/team handling
  if (data.email && ATTRIBUTE_IDS.email) {
    values[ATTRIBUTE_IDS.email] = [{ email_address: data.email }];
  }

  // Handle role and team information intelligently
  let roleText = data.role || "";
  let notesText = data.notes || "";

  // If this person is associated with a team, add it to their description
  if (data.team || (data.role && isTeamOrRole(data.role))) {
    const teamInfo = data.team || data.role;
    notesText = notesText
      ? `${notesText}\nTeam/Department: ${teamInfo}`
      : `Team/Department: ${teamInfo}`;

    if (ATTRIBUTE_IDS.department) {
      values[ATTRIBUTE_IDS.department] = teamInfo;
    }
  }

  if (roleText && ATTRIBUTE_IDS.role && !isTeamOrRole(roleText)) {
    values[ATTRIBUTE_IDS.role] = roleText;
  }

  if (data.sentiment && ATTRIBUTE_IDS.sentiment) {
    values[ATTRIBUTE_IDS.sentiment] = data.sentiment;
  }

  if (notesText && ATTRIBUTE_IDS.notes) {
    values[ATTRIBUTE_IDS.notes] = notesText;
  }

  // Employee-specific fields
  if (data.employee_id && ATTRIBUTE_IDS.employee_id) {
    values[ATTRIBUTE_IDS.employee_id] = data.employee_id;
  }

  if (data.manager && ATTRIBUTE_IDS.manager) {
    values[ATTRIBUTE_IDS.manager] = data.manager;
  }

  const payload = JSON.stringify({ data: { values } });

  const res = await fetch(`${ATTIO_API_BASE}/objects/${peopleId}/records`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json",
    },
    body: payload,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to create person: ${JSON.stringify(json)}`);
  }

  console.log(
    "✅ Person created with enhanced attributes:",
    json.data?.id?.record_id
  );
  return json.data?.id?.record_id;
}

// ========== ENHANCED DEAL MANAGEMENT ==========

async function upsertDealEnhanced(data, processedEntities) {
  console.log("💼 Enhanced upserting deal:", data.name);

  const existing = await queryDealByName(data.name);
  if (existing) {
    return await updateDealEnhanced(
      existing.id.record_id,
      data,
      processedEntities
    );
  } else {
    return await createDealEnhanced(data, processedEntities);
  }
}

// Fixed deal owner handling in createDealEnhanced function
async function createDealEnhanced(data, processedEntities) {
  const dealsId = await getObjectIdBySlug("deals");

  const values = {};

  if (ATTRIBUTE_IDS.deal_name) {
    values[ATTRIBUTE_IDS.deal_name] = data.name;
  }
  if (data.value && ATTRIBUTE_IDS.deal_value) {
    values[ATTRIBUTE_IDS.deal_value] = parseFloat(
      data.value.toString().replace(/[,$]/g, "")
    );
  }
  if (data.close_date && ATTRIBUTE_IDS.close_date) {
    values[ATTRIBUTE_IDS.close_date] = parseDealDate(data.close_date);
  }

  // ❌ Removed hardcoded deal_owner assignment

  if (data.stage && ATTRIBUTE_IDS.stage) {
    const matchedStage = await mapToValidStage(data.stage);
    if (matchedStage && matchedStage.id) {
      values[ATTRIBUTE_IDS.stage] = matchedStage.id;
    }
  }

  if (data.probability && ATTRIBUTE_IDS.probability) {
    values[ATTRIBUTE_IDS.probability] = data.probability;
  }
  if (data.competitors && ATTRIBUTE_IDS.competitors) {
    values[ATTRIBUTE_IDS.competitors] = Array.isArray(data.competitors)
      ? data.competitors.join(", ")
      : data.competitors;
  }
  if (data.pain_points && ATTRIBUTE_IDS.pain_points) {
    values[ATTRIBUTE_IDS.pain_points] = Array.isArray(data.pain_points)
      ? data.pain_points.join(", ")
      : data.pain_points;
  }
  if (data.internal_stakeholders && ATTRIBUTE_IDS.internal_stakeholders) {
    values[ATTRIBUTE_IDS.internal_stakeholders] = Array.isArray(
      data.internal_stakeholders
    )
      ? data.internal_stakeholders.join(", ")
      : data.internal_stakeholders;
  }

  const payload = { data: { values } };

  const linkedRecords = [];

  if (data.company && processedEntities.companies[data.company]) {
    linkedRecords.push({
      target_object: "companies",
      target_record_id: processedEntities.companies[data.company],
    });
  }

  if (linkedRecords.length > 0) {
    payload.data.linked_records = linkedRecords;
  }

  const res = await fetch(`${ATTIO_API_BASE}/objects/${dealsId}/records`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) {
    console.error(
      "❌ Enhanced deal creation failed:",
      JSON.stringify(json, null, 2)
    );
    throw new Error(`Failed to create deal: ${JSON.stringify(json)}`);
  }

  const dealId = json.data?.id?.record_id;
  return dealId;
}

async function updateDealEnhanced(recordId, data, processedEntities) {
  const dealsId = await getObjectIdBySlug("deals");

  const values = {};

  if (data.value && ATTRIBUTE_IDS.deal_value) {
    values[ATTRIBUTE_IDS.deal_value] = parseFloat(
      data.value.toString().replace(/[,$]/g, "")
    );
  }
  if (data.close_date && ATTRIBUTE_IDS.close_date) {
    values[ATTRIBUTE_IDS.close_date] = parseDealDate(data.close_date);
  }

  // ❌ Removed hardcoded deal_owner assignment

  if (data.stage && ATTRIBUTE_IDS.stage) {
    const matchedStage = await mapToValidStage(data.stage);
    if (matchedStage && matchedStage.id) {
      values[ATTRIBUTE_IDS.stage] = matchedStage.id;
    }
  }

  if (data.probability && ATTRIBUTE_IDS.probability) {
    values[ATTRIBUTE_IDS.probability] = data.probability;
  }
  if (data.competitors && ATTRIBUTE_IDS.competitors) {
    values[ATTRIBUTE_IDS.competitors] = Array.isArray(data.competitors)
      ? data.competitors.join(", ")
      : data.competitors;
  }
  if (data.pain_points && ATTRIBUTE_IDS.pain_points) {
    values[ATTRIBUTE_IDS.pain_points] = Array.isArray(data.pain_points)
      ? data.pain_points.join(", ")
      : data.pain_points;
  }

  if (Object.keys(values).length === 0) {
    return recordId;
  }

  const payload = JSON.stringify({ data: { values } });

  const res = await fetch(
    `${ATTIO_API_BASE}/objects/${dealsId}/records/${recordId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: BEARER_TOKEN,
        "Content-Type": "application/json",
      },
      body: payload,
    }
  );

  if (!res.ok) {
    const json = await res.json();
    throw new Error(`Failed to update deal: ${JSON.stringify(json)}`);
  }

  return recordId;
}

// ========== LINKING FUNCTIONALITY ==========

async function linkPersonToCompany(personId, companyId) {
  console.log(`🔗 Linking person ${personId} to company ${companyId}`);

  try {
    // This creates a relationship between person and company
    // Implementation depends on your Attio workspace relationship configuration

    const payload = {
      data: {
        linked_records: [
          {
            target_object: "companies",
            target_record_id: companyId,
          },
        ],
      },
    };

    const peopleId = await getObjectIdBySlug("people");
    const res = await fetch(
      `${ATTIO_API_BASE}/objects/${peopleId}/records/${personId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: BEARER_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (res.ok) {
      console.log(`✅ Successfully linked person to company`);
    } else {
      console.log(`⚠️ Person-company linking may need manual configuration`);
    }
  } catch (err) {
    console.log(
      `⚠️ Person-company linking failed - may need workspace setup:`,
      err.message
    );
  }
}

// ========== RELATIONSHIP MANAGEMENT ==========

async function updateRelationships(data, processedEntities) {
  console.log("🔗 Updating enhanced relationships:", data);

  // Multi-contact relationship updates with team handling
  if (data.contact_updates) {
    for (const update of data.contact_updates) {
      // Skip if this is a team/role rather than person
      if (isTeamOrRole(update.name)) {
        console.log(
          `🚫 Skipping team/role relationship update: ${update.name}`
        );
        continue;
      }

      if (processedEntities.people[update.name]) {
        await updatePersonWithSentiment(processedEntities.people[update.name], {
          sentiment: update.sentiment,
          notes: update.context,
        });
      }
    }
  }

  // Account-level health scoring
  if (
    data.account_health &&
    data.company &&
    processedEntities.companies[data.company]
  ) {
    await updateCompany(processedEntities.companies[data.company], {
      relationship_health: data.account_health.overall_score,
      expansion_opportunity: data.account_health.expansion_notes,
      churn_risk: data.account_health.risk_level,
    });
  }

  // Internal department relationships for employee-employee CRM
  if (data.internal_relationships) {
    for (const relationship of data.internal_relationships) {
      if (
        relationship.type === "reporting" &&
        relationship.manager &&
        relationship.employee
      ) {
        // Link manager-employee relationships
        const managerId = processedEntities.people[relationship.manager];
        const employeeId = processedEntities.people[relationship.employee];

        if (managerId && employeeId && ATTRIBUTE_IDS.manager) {
          await updatePersonWithManager(employeeId, managerId);
        }
      }
    }
  }
}

async function updatePersonWithManager(employeeId, managerId) {
  const peopleId = await getObjectIdBySlug("people");

  const values = {};
  if (ATTRIBUTE_IDS.manager) {
    values[ATTRIBUTE_IDS.manager] = managerId;
  }

  const payload = JSON.stringify({ data: { values } });

  const res = await fetch(
    `${ATTIO_API_BASE}/objects/${peopleId}/records/${employeeId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: BEARER_TOKEN,
        "Content-Type": "application/json",
      },
      body: payload,
    }
  );

  if (res.ok) {
    console.log(
      `✅ Manager relationship updated: ${employeeId} -> ${managerId}`
    );
  } else {
    console.log(`⚠️ Failed to update manager relationship`);
  }
}

async function updatePersonWithSentiment(recordId, data) {
  const peopleId = await getObjectIdBySlug("people");

  const values = {};

  if (data.email && ATTRIBUTE_IDS.email) {
    values[ATTRIBUTE_IDS.email] = [{ email_address: data.email }];
  }
  if (data.role && ATTRIBUTE_IDS.role && !isTeamOrRole(data.role)) {
    values[ATTRIBUTE_IDS.role] = data.role;
  }
  if (data.sentiment && ATTRIBUTE_IDS.sentiment) {
    values[ATTRIBUTE_IDS.sentiment] = data.sentiment;
  }
  if (data.notes && ATTRIBUTE_IDS.notes) {
    // Append to existing notes instead of replacing
    const existing = await getPersonById(recordId);
    const existingNotes = existing?.values?.[ATTRIBUTE_IDS.notes] || "";
    const separator = existingNotes ? "\n\n" : "";
    values[ATTRIBUTE_IDS.notes] = existingNotes + separator + data.notes;
  }

  // Handle team/department information
  if (data.team && ATTRIBUTE_IDS.department) {
    values[ATTRIBUTE_IDS.department] = data.team;
  }

  if (Object.keys(values).length === 0) return recordId;

  const payload = JSON.stringify({ data: { values } });

  const res = await fetch(
    `${ATTIO_API_BASE}/objects/${peopleId}/records/${recordId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: BEARER_TOKEN,
        "Content-Type": "application/json",
      },
      body: payload,
    }
  );

  if (!res.ok) {
    const json = await res.json();
    throw new Error(`Failed to update person: ${JSON.stringify(json)}`);
  }

  console.log("✅ Person updated with enhanced sentiment:", recordId);
  return recordId;
}

async function getPersonById(recordId) {
  const peopleId = await getObjectIdBySlug("people");

  const res = await fetch(
    `${ATTIO_API_BASE}/objects/${peopleId}/records/${recordId}`,
    {
      headers: { Authorization: BEARER_TOKEN },
    }
  );

  if (res.ok) {
    const json = await res.json();
    return json.data;
  }
  return null;
}

// ========== COMPANIES ==========

async function upsertCompany(data) {
  console.log("🏢 Upserting company:", data.name);

  const existing = await queryCompanyByName(data.name);
  if (existing) {
    return await updateCompany(existing.id.record_id, data);
  } else {
    return await createCompany(data);
  }
}

async function createCompany(data) {
  const companiesId = await getObjectIdBySlug("companies");

  const values = {};
  if (ATTRIBUTE_IDS.company_name) {
    values[ATTRIBUTE_IDS.company_name] = data.name;
  }
  if (data.relationship_health && ATTRIBUTE_IDS.relationship_health) {
    values[ATTRIBUTE_IDS.relationship_health] = data.relationship_health;
  }
  if (data.expansion_opportunity && ATTRIBUTE_IDS.expansion_opportunity) {
    values[ATTRIBUTE_IDS.expansion_opportunity] = data.expansion_opportunity;
  }
  if (data.churn_risk && ATTRIBUTE_IDS.churn_risk) {
    values[ATTRIBUTE_IDS.churn_risk] = data.churn_risk;
  }

  // Internal department support
  if (data.internal_department && ATTRIBUTE_IDS.internal_department) {
    values[ATTRIBUTE_IDS.internal_department] = data.internal_department;
  }

  const payload = JSON.stringify({ data: { values } });

  const res = await fetch(`${ATTIO_API_BASE}/objects/${companiesId}/records`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json",
    },
    body: payload,
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to create company: ${JSON.stringify(json)}`);
  }

  console.log("✅ Company created:", json.data?.id?.record_id);
  return json.data?.id?.record_id;
}

async function updateCompany(recordId, data) {
  const companiesId = await getObjectIdBySlug("companies");

  const values = {};
  if (data.relationship_health && ATTRIBUTE_IDS.relationship_health) {
    values[ATTRIBUTE_IDS.relationship_health] = data.relationship_health;
  }
  if (data.expansion_opportunity && ATTRIBUTE_IDS.expansion_opportunity) {
    values[ATTRIBUTE_IDS.expansion_opportunity] = data.expansion_opportunity;
  }
  if (data.churn_risk && ATTRIBUTE_IDS.churn_risk) {
    values[ATTRIBUTE_IDS.churn_risk] = data.churn_risk;
  }
  if (data.internal_department && ATTRIBUTE_IDS.internal_department) {
    values[ATTRIBUTE_IDS.internal_department] = data.internal_department;
  }

  if (Object.keys(values).length === 0) return recordId;

  const payload = JSON.stringify({ data: { values } });

  const res = await fetch(
    `${ATTIO_API_BASE}/objects/${companiesId}/records/${recordId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: BEARER_TOKEN,
        "Content-Type": "application/json",
      },
      body: payload,
    }
  );

  if (!res.ok) {
    const json = await res.json();
    throw new Error(`Failed to update company: ${JSON.stringify(json)}`);
  }

  console.log("✅ Company updated:", recordId);
  return recordId;
}

async function queryCompanyByName(name) {
  const companiesId = await getObjectIdBySlug("companies");

  const payload = {
    filter: {
      and: [
        {
          attribute: ATTRIBUTE_IDS.company_name,
          query: name,
        },
      ],
    },
    limit: 1,
  };

  const res = await fetch(
    `${ATTIO_API_BASE}/objects/${companiesId}/records/query`,
    {
      method: "POST",
      headers: {
        Authorization: BEARER_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const json = await res.json();
  return json.data && json.data.length > 0 ? json.data[0] : null;
}

async function queryDealByName(name) {
  const dealsId = await getObjectIdBySlug("deals");

  const payload = {
    filter: {
      and: [
        {
          attribute: ATTRIBUTE_IDS.deal_name,
          query: name,
        },
      ],
    },
    limit: 1,
  };

  const res = await fetch(
    `${ATTIO_API_BASE}/objects/${dealsId}/records/query`,
    {
      method: "POST",
      headers: {
        Authorization: BEARER_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  const json = await res.json();
  return json.data && json.data.length > 0 ? json.data[0] : null;
}

// ========== ADVANCED TASK MANAGEMENT ==========

async function upsertAdvancedTask(data, processedEntities) {
  console.log("📋 Creating advanced task:", data.description);

  const payload = {
    data: {
      content: data.description,
      format: "plaintext",
      deadline_at: data.due_date,
      is_completed: false,
      assignees: data.assignees || [],
    },
  };

  // Enhanced linking to multiple entities with better entity resolution
  const linkedRecords = [];

  if (
    data.link_to_person_name &&
    processedEntities.people[data.link_to_person_name]
  ) {
    linkedRecords.push({
      target_object: "people",
      target_record_id: processedEntities.people[data.link_to_person_name],
    });
  }

  if (
    data.link_to_company &&
    processedEntities.companies[data.link_to_company]
  ) {
    linkedRecords.push({
      target_object: "companies",
      target_record_id: processedEntities.companies[data.link_to_company],
    });
  }

  if (data.link_to_deal && processedEntities.deals[data.link_to_deal]) {
    linkedRecords.push({
      target_object: "deals",
      target_record_id: processedEntities.deals[data.link_to_deal],
    });
  }

  if (linkedRecords.length > 0) {
    payload.data.linked_records = linkedRecords;
  }

  const res = await fetch(`${ATTIO_API_BASE}/tasks`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Failed to create advanced task: ${JSON.stringify(json)}`);
  }

  console.log("✅ Advanced task created:", json.data?.id);
  return json.data?.id;
}

// ========== UTILITY FUNCTIONS ==========

function parseDealDate(dateStr) {
  try {
    if (dateStr.toLowerCase().includes("q1")) {
      const year =
        new Date().getFullYear() + (dateStr.includes("next year") ? 1 : 0);
      return new Date(year, 2, 31).toISOString(); // End of Q1
    }
    if (dateStr.toLowerCase().includes("q2")) {
      const year =
        new Date().getFullYear() + (dateStr.includes("next year") ? 1 : 0);
      return new Date(year, 5, 30).toISOString(); // End of Q2
    }
    if (dateStr.toLowerCase().includes("q3")) {
      const year =
        new Date().getFullYear() + (dateStr.includes("next year") ? 1 : 0);
      return new Date(year, 8, 30).toISOString(); // End of Q3
    }
    if (dateStr.toLowerCase().includes("q4")) {
      const year =
        new Date().getFullYear() + (dateStr.includes("next year") ? 1 : 0);
      return new Date(year, 11, 31).toISOString(); // End of Q4
    }

    return new Date(dateStr).toISOString();
  } catch {
    const nextQuarter = new Date();
    nextQuarter.setMonth(nextQuarter.getMonth() + 3);
    return nextQuarter.toISOString();
  }
}

async function getObjectIdBySlug(slug) {
  if (objectCache[slug]) return objectCache[slug];

  const res = await fetch(`${ATTIO_API_BASE}/objects/${slug}`, {
    headers: { Authorization: BEARER_TOKEN },
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

async function initializeAttributeIds() {
  try {
    console.log("🔧 Initializing advanced attribute IDs...");

    // Load valid stage options first
    await getValidStageOptions();

    // Get all object attributes
    const peopleAttrs = await getAttributeIds("people");
    const dealAttrs = await getAttributeIds("deals");
    const companyAttrs = await getAttributeIds("companies");

    // Map to our attribute system - only override if we find the actual attribute
    if (peopleAttrs.email_addresses)
      ATTRIBUTE_IDS.email = peopleAttrs.email_addresses;
    if (peopleAttrs.phone_numbers)
      ATTRIBUTE_IDS.phone = peopleAttrs.phone_numbers;
    if (peopleAttrs.notes) ATTRIBUTE_IDS.notes = peopleAttrs.notes;
    if (peopleAttrs.role) ATTRIBUTE_IDS.role = peopleAttrs.role;
    if (peopleAttrs.sentiment) ATTRIBUTE_IDS.sentiment = peopleAttrs.sentiment;
    if (peopleAttrs.department)
      ATTRIBUTE_IDS.department = peopleAttrs.department;
    if (peopleAttrs.employee_id)
      ATTRIBUTE_IDS.employee_id = peopleAttrs.employee_id;
    if (peopleAttrs.manager) ATTRIBUTE_IDS.manager = peopleAttrs.manager;

    if (dealAttrs.name) ATTRIBUTE_IDS.deal_name = dealAttrs.name;
    if (dealAttrs.value) ATTRIBUTE_IDS.deal_value = dealAttrs.value;
    if (dealAttrs.close_date) ATTRIBUTE_IDS.close_date = dealAttrs.close_date;
    if (dealAttrs.stage) ATTRIBUTE_IDS.stage = dealAttrs.stage;
    if (dealAttrs.probability)
      ATTRIBUTE_IDS.probability = dealAttrs.probability;
    if (dealAttrs.competitors)
      ATTRIBUTE_IDS.competitors = dealAttrs.competitors;
    if (dealAttrs.pain_points)
      ATTRIBUTE_IDS.pain_points = dealAttrs.pain_points;
    if (dealAttrs.internal_stakeholders)
      ATTRIBUTE_IDS.internal_stakeholders = dealAttrs.internal_stakeholders;

    if (companyAttrs.name) ATTRIBUTE_IDS.company_name = companyAttrs.name;
    if (companyAttrs.relationship_health)
      ATTRIBUTE_IDS.relationship_health = companyAttrs.relationship_health;
    if (companyAttrs.expansion_opportunity)
      ATTRIBUTE_IDS.expansion_opportunity = companyAttrs.expansion_opportunity;
    if (companyAttrs.churn_risk)
      ATTRIBUTE_IDS.churn_risk = companyAttrs.churn_risk;
    if (companyAttrs.internal_department)
      ATTRIBUTE_IDS.internal_department = companyAttrs.internal_department;

    console.log("✅ Advanced attribute IDs initialized");
    console.log(
      "📋 Available stages:",
      validStagesCache.stages?.map((s) => s.title)
    );
    console.log("🔧 Attribute mapping completed:", ATTRIBUTE_IDS);
  } catch (err) {
    console.error("❌ Failed to initialize advanced attribute IDs:", err);
  }
}

async function getAttributeIds(objectSlug) {
  if (attributeCache[objectSlug]) return attributeCache[objectSlug];

  const objectId = await getObjectIdBySlug(objectSlug);
  const res = await fetch(`${ATTIO_API_BASE}/objects/${objectId}/attributes`, {
    headers: { Authorization: BEARER_TOKEN },
  });

  const json = await res.json();
  const attributes = {};

  if (json.data) {
    json.data.forEach((attr) => {
      attributes[attr.api_slug] = attr.id.attribute_id;
    });
  }

  attributeCache[objectSlug] = attributes;
  return attributes;
}

// ========== INTELLIGENCE LAYER ==========

function analyzeDealLanguage(text) {
  const analysis = {
    stage: "Discovery",
    probability: 50,
    sentiment: "neutral",
    urgency: "medium",
    buying_signals: [],
    risk_signals: [],
    competitors: [],
    value_indicators: [],
  };

  const lowerText = text.toLowerCase();

  // Stage detection - now uses proper stage names
  for (const [stage, indicators] of Object.entries(DEAL_STAGES)) {
    if (indicators.some((indicator) => lowerText.includes(indicator))) {
      analysis.stage = stage;
      break;
    }
  }

  // Sentiment analysis
  const SENTIMENT_INDICATORS = {
    positive: [
      "love",
      "great",
      "excellent",
      "fantastic",
      "really well",
      "impressed",
      "excited",
    ],
    negative: [
      "concerned",
      "worried",
      "skeptical",
      "issues",
      "problems",
      "disappointed",
    ],
    neutral: ["okay", "fine", "standard", "normal", "average"],
  };

  const positiveCount = SENTIMENT_INDICATORS.positive.filter((word) =>
    lowerText.includes(word)
  ).length;
  const negativeCount = SENTIMENT_INDICATORS.negative.filter((word) =>
    lowerText.includes(word)
  ).length;

  if (positiveCount > negativeCount) analysis.sentiment = "positive";
  else if (negativeCount > positiveCount) analysis.sentiment = "negative";

  // Leading indicators
  const LEADING_INDICATORS = {
    strong_buying_signals: [
      "budget approved",
      "decision made",
      "ready to move forward",
      "when can we start",
    ],
    risk_signals: [
      "legal reviewing",
      "budget concerns",
      "need to think",
      "other priorities",
    ],
    urgency_signals: ["asap", "urgent", "by end of quarter", "timeline"],
    technical_fit: [
      "integration",
      "API",
      "technical requirements",
      "engineering team",
    ],
  };

  analysis.buying_signals = LEADING_INDICATORS.strong_buying_signals.filter(
    (signal) => lowerText.includes(signal)
  );
  analysis.risk_signals = LEADING_INDICATORS.risk_signals.filter((signal) =>
    lowerText.includes(signal)
  );

  // Probability adjustment based on signals
  if (analysis.buying_signals.length > 0) analysis.probability += 20;
  if (analysis.risk_signals.length > 0) analysis.probability -= 15;

  // Value extraction (look for dollar amounts)
  const valueMatch = text.match(/\$?([\d,]+)k?/gi);
  if (valueMatch) {
    analysis.value_indicators = valueMatch;
  }

  return analysis;
}

export {
  sendToAttio,
  initializeAttributeIds,
  analyzeDealLanguage,
  DEAL_STAGES,
  mapToValidStage,
  getValidStageOptions,
  isTeamOrRole,
  namesAreSimilar,
};

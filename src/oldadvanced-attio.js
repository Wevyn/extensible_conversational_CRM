// advanced-attio.js - Enhanced CRM with deal intelligence and relationship mapping
const ATTIO_API_BASE = "https://api.attio.com/v2";
const BEARER_TOKEN = "Bearer e01cca9d5d70d62535755e3f1609118082790728f8c98dbd0b3f9cce1aae3f53";

const objectCache = {};
const attributeCache = {};
const validStagesCache = {}; // Cache for valid stage options

// Enhanced attribute mappings for advanced features
const ATTRIBUTE_IDS = {
  // People attributes
  name: "3a2d79ac-1c54-4d1d-9bd1-df92ba80052f",
  email: "4ab52dd0-edfe-4eea-b73c-561028076ea6",
  phone: "57e614f6-a910-4df8-a7a5-f175d85a8825",
  notes: "168ddd0a-6dc6-4aff-8939-60dcfe1cdf41",
  role: "4bb82d05-40dc-49d1-a033-7451290ce027",
  sentiment: "26ad2c8d-1bfe-48b0-ab9a-8a26c9ff5cab",
  
  // Deal attributes  
  deal_name: "10f12732-a9aa-4ed0-a0eb-90e4ce4552e9",
  deal_value: "a0d4ad64-1e1c-4fec-88af-88bfe901d7af",
  close_date: "d3cc7600-bab7-4a4d-bbe7-222620cf8637",
  stage: "6fbebe44-2dfe-4ef4-b524-e196de38ede3",
  probability: "515599b4-63dd-4084-b704-df5fccb81a16",
  competitors: "5f41c718-9fd3-4a16-84fc-ca8c2e97fa49",
  decision_maker: "25ee890c-4306-4b25-8364-2341f52c4184",
  pain_points: "abc75e84-5ebd-4fcb-a0f6-e3f1110dba4c",
  deal_owner: "3b616cdc-1714-4db7-b99a-1007103ed6cf", 

  
  // Company attributes
  company_name: "a79670ce-befc-4e50-b281-7afce520dde6",
  relationship_health: "a73d90c1-495c-488a-87ee-46bdbfa40905",
  expansion_opportunity: "1c2d7097-a3d8-45ed-a751-3c2d4c4dd8a4",
  churn_risk: "cf45e420-3fdf-4837-8aa5-97d56b7d9848"
};

// Deal stage mapping based on language patterns - now maps to common Attio stage names
const DEAL_STAGES = {
  "Qualified": ["First Call", "Initial Discussion", "Introduction", "Qualified"],
  "Discovery": ["Understanding", "Requirements", "Pain Points", "Challenges", "Discovery"],
  "Demo": ["Demo", "Demonstration", "Showing", "Presentation"],
  "Proposal": ["Proposal", "Quote", "Pricing", "Budget Approved"],
  "Negotiation": ["Legal Review", "Contract", "Terms", "Negotiating", "Negotiation"],
  "Closed Won": ["Signed", "Closed", "Deal Done", "Approved", "Won"],
  "Closed Lost": ["Went With", "Chose", "Lost To", "Not Moving Forward", "Lost"]
};

// Function to get valid stage options from Attio
async function getValidStageOptions() {
  if (validStagesCache.stages) {
    return validStagesCache.stages;
  }

  try {
    const dealsId = await getObjectIdBySlug("deals");
    const stageAttributeId = ATTRIBUTE_IDS.stage;
    
    const res = await fetch(`${ATTIO_API_BASE}/objects/${dealsId}/attributes/${stageAttributeId}`, {
      headers: { Authorization: BEARER_TOKEN }
    });

    if (res.ok) {
      const json = await res.json();
      const options = json.data?.config?.options || [];
      validStagesCache.stages = options.map(option => ({
        id: option.id,
        title: option.title
      }));
      console.log('✅ Valid stage options loaded:', validStagesCache.stages);
      return validStagesCache.stages;
    }
  } catch (err) {
    console.error('❌ Failed to load stage options:', err);
  }

  // Fallback to common stage names
  validStagesCache.stages = [
    { id: 'qualified', title: 'Qualified' },
    { id: 'discovery', title: 'Discovery' },
    { id: 'demo', title: 'Demo' },
    { id: 'proposal', title: 'Proposal' },
    { id: 'negotiation', title: 'Negotiation' },
    { id: 'closed-won', title: 'Closed Won' },
    { id: 'closed-lost', title: 'Closed Lost' }
  ];
  return validStagesCache.stages;
}

// Function to map stage name to valid Attio stage
async function mapToValidStage(stageInput) {
  const validStages = await getValidStageOptions();
  const lowerInput = stageInput.toLowerCase();

  // First try exact match by title
  const exactMatch = validStages.find(stage => 
    stage.title.toLowerCase() === lowerInput
  );
  if (exactMatch) return exactMatch.title;

  // Try fuzzy matching with our stage mapping
  for (const [validStage, indicators] of Object.entries(DEAL_STAGES)) {
    if (indicators.some(indicator => lowerInput.includes(indicator))) {
      const match = validStages.find(stage => 
        stage.title.toLowerCase().includes(validStage.toLowerCase())
      );
      if (match) return match.title;
    }
  }

  // Default to first valid stage or Discovery
  const defaultStage = validStages.find(stage => 
    stage.title.toLowerCase().includes('discovery') || 
    stage.title.toLowerCase().includes('qualified')
  );
  
  if (defaultStage) {
    console.log(`⚠️ Using default stage "${defaultStage.title}" for input "${stageInput}"`);
    return defaultStage.title;
  }

  // Last resort - use first available stage
  if (validStages.length > 0) {
    console.log(`⚠️ Using first available stage "${validStages[0].title}" for input "${stageInput}"`);
    return validStages[0].title;
  }

  return null; // Don't set stage if none available
}

// Sentiment indicators
const SENTIMENT_INDICATORS = {
  positive: ["love", "great", "excellent", "fantastic", "really well", "impressed", "excited"],
  negative: ["concerned", "worried", "skeptical", "issues", "problems", "disappointed"],
  neutral: ["okay", "fine", "standard", "normal", "average"]
};

// Leading indicators for deal prediction
const LEADING_INDICATORS = {
  strong_buying_signals: ["budget approved", "decision made", "ready to move forward", "when can we start"],
  risk_signals: ["legal reviewing", "budget concerns", "need to think", "other priorities"],
  urgency_signals: ["asap", "urgent", "by end of quarter", "timeline"],
  technical_fit: ["integration", "API", "technical requirements", "engineering team"]
};

async function sendToAttio(updates) {
  console.log('🔄 Processing advanced updates:', updates);
  
  // Process in order: companies -> people -> deals -> tasks
  const companyUpdates = updates.filter(item => item.type === "company");
  const personUpdates = updates.filter(item => item.type === "person");
  const dealUpdates = updates.filter(item => item.type === "deal");
  const taskUpdates = updates.filter(item => item.type === "task");
  const relationshipUpdates = updates.filter(item => item.type === "relationship");
  
  const processedEntities = {
    companies: {},
    people: {},
    deals: {}
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
  
  // Process people with company relationships
  for (const item of personUpdates) {
    try {
      const personId = await upsertPerson(item);
      processedEntities.people[item.name] = personId;
      
      // Link to company if specified
      if (item.company && processedEntities.companies[item.company]) {
        await linkPersonToCompany(personId, processedEntities.companies[item.company]);
      }
    } catch (err) {
      console.error("❌ Failed to process person:", item, err);
    }
  }
  
  // Process deals with relationships
  for (const item of dealUpdates) {
    try {
      const dealId = await upsertDeal(item, processedEntities);
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

// ========== COMPANIES ==========

async function upsertCompany(data) {
  console.log('🏢 Upserting company:', data.name);
  
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

  const payload = JSON.stringify({ data: { values } });

  const res = await fetch(`${ATTIO_API_BASE}/objects/${companiesId}/records`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: payload
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

  if (Object.keys(values).length === 0) return recordId;

  const payload = JSON.stringify({ data: { values } });

  const res = await fetch(`${ATTIO_API_BASE}/objects/${companiesId}/records/${recordId}`, {
    method: "PATCH",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: payload
  });

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
      and: [{
        attribute: ATTRIBUTE_IDS.company_name,
        query: name
      }]
    },
    limit: 1
  };

  const res = await fetch(`${ATTIO_API_BASE}/objects/${companiesId}/records/query`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  return json.data && json.data.length > 0 ? json.data[0] : null;
}

// ========== DEALS ==========

async function upsertDeal(data, processedEntities) {
  console.log('💼 Upserting deal:', data.name);
  
  const existing = await queryDealByName(data.name);
  if (existing) {
    return await updateDeal(existing.id.record_id, data, processedEntities);
  } else {
    return await createDeal(data, processedEntities);
  }
}

async function createDeal(data, processedEntities) {
  const dealsId = await getObjectIdBySlug("deals");
  
  const values = {};
  
  if (ATTRIBUTE_IDS.deal_name) {
    values[ATTRIBUTE_IDS.deal_name] = data.name;
  }
  if (data.value && ATTRIBUTE_IDS.deal_value) {
    values[ATTRIBUTE_IDS.deal_value] = parseFloat(data.value.toString().replace(/[,$]/g, ''));
  }
  if (data.close_date && ATTRIBUTE_IDS.close_date) {
    values[ATTRIBUTE_IDS.close_date] = parseDealDate(data.close_date);
  }
  if (data.deal_owner && ATTRIBUTE_IDS.deal_owner) {
    values[ATTRIBUTE_IDS.deal_owner] = data.deal_owner;
  }

  // FIX: Validate and map stage to valid Attio stage
  if (data.stage && ATTRIBUTE_IDS.stage) {
    const validStage = await mapToValidStage(data.stage);
    if (validStage) {
      values[ATTRIBUTE_IDS.stage] = validStage;
      console.log(`✅ Mapped stage "${data.stage}" to "${validStage}"`);
    } else {
      console.log(`⚠️ Skipping invalid stage: "${data.stage}"`);
    }
  }
  
  if (data.probability && ATTRIBUTE_IDS.probability) {
    values[ATTRIBUTE_IDS.probability] = data.probability;
  }
  if (data.competitors && ATTRIBUTE_IDS.competitors) {
    values[ATTRIBUTE_IDS.competitors] = data.competitors;
  }
  if (data.pain_points && ATTRIBUTE_IDS.pain_points) {
    values[ATTRIBUTE_IDS.pain_points] = data.pain_points;
  }

  const payload = { data: { values } };
  
  // Link to company and people
  if (data.company && processedEntities.companies[data.company]) {
    payload.data.linked_records = [{
      target_object: "companies",
      target_record_id: processedEntities.companies[data.company]
    }];
  }

  console.log('📝 Creating deal with payload:', JSON.stringify(payload, null, 2));

  const res = await fetch(`${ATTIO_API_BASE}/objects/${dealsId}/records`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  if (!res.ok) {
    console.error('❌ Deal creation failed:', JSON.stringify(json, null, 2));
    throw new Error(`Failed to create deal: ${JSON.stringify(json)}`);
  }

  console.log("✅ Deal created:", json.data?.id?.record_id);
  return json.data?.id?.record_id;
}

async function updateDeal(recordId, data, processedEntities) {
  const dealsId = await getObjectIdBySlug("deals");
  
  const values = {};
  
  if (data.value && ATTRIBUTE_IDS.deal_value) {
    values[ATTRIBUTE_IDS.deal_value] = parseFloat(data.value.toString().replace(/[,$]/g, ''));
  }
  if (data.close_date && ATTRIBUTE_IDS.close_date) {
    values[ATTRIBUTE_IDS.close_date] = parseDealDate(data.close_date);
  }
  
  // FIX: Validate and map stage to valid Attio stage
  if (data.stage && ATTRIBUTE_IDS.stage) {
    const validStage = await mapToValidStage(data.stage);
    if (validStage) {
      values[ATTRIBUTE_IDS.stage] = validStage;
      console.log(`✅ Mapped stage "${data.stage}" to "${validStage}"`);
    } else {
      console.log(`⚠️ Skipping invalid stage: "${data.stage}"`);
    }
  }
  
  if (data.probability && ATTRIBUTE_IDS.probability) {
    values[ATTRIBUTE_IDS.probability] = data.probability;
  }
  if (data.competitors && ATTRIBUTE_IDS.competitors) {
    values[ATTRIBUTE_IDS.competitors] = data.competitors;
  }
  if (data.pain_points && ATTRIBUTE_IDS.pain_points) {
    values[ATTRIBUTE_IDS.pain_points] = data.pain_points;
  }

  if (Object.keys(values).length === 0) return recordId;

  const payload = JSON.stringify({ data: { values } });

  const res = await fetch(`${ATTIO_API_BASE}/objects/${dealsId}/records/${recordId}`, {
    method: "PATCH",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: payload
  });

  if (!res.ok) {
    const json = await res.json();
    throw new Error(`Failed to update deal: ${JSON.stringify(json)}`);
  }

  console.log("✅ Deal updated:", recordId);
  return recordId;
}

async function queryDealByName(name) {
  const dealsId = await getObjectIdBySlug("deals");
  
  const payload = {
    filter: {
      and: [{
        attribute: ATTRIBUTE_IDS.deal_name,
        query: name
      }]
    },
    limit: 1
  };

  const res = await fetch(`${ATTIO_API_BASE}/objects/${dealsId}/records/query`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  return json.data && json.data.length > 0 ? json.data[0] : null;
}

// ========== ENHANCED PERSON MANAGEMENT ==========

async function upsertPerson(data) {
  console.log('👤 Upserting person with sentiment:', data.name, data.sentiment);
  
  const existing = await queryPersonByName(data.name);
  if (existing) {
    return await updatePersonWithSentiment(existing.id.record_id, data);
  } else {
    return await createPersonWithSentiment(data);
  }
}

async function createPersonWithSentiment(data) {
  const peopleId = await getObjectIdBySlug("people");
  const fullName = `${data.first_name || ""} ${data.last_name || ""}`.trim();

  const values = {
    [ATTRIBUTE_IDS.name]: [{
      first_name: data.first_name || "Unknown",
      last_name: data.last_name || "",
      full_name: fullName
    }]
  };

  // Enhanced attributes
  if (data.email && ATTRIBUTE_IDS.email) {
    values[ATTRIBUTE_IDS.email] = [{ email_address: data.email }];
  }
  if (data.role && ATTRIBUTE_IDS.role) {
    values[ATTRIBUTE_IDS.role] = data.role;
  }
  if (data.sentiment && ATTRIBUTE_IDS.sentiment) {
    values[ATTRIBUTE_IDS.sentiment] = data.sentiment;
  }
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
    throw new Error(`Failed to create person: ${JSON.stringify(json)}`);
  }

  console.log("✅ Person created with sentiment:", json.data?.id?.record_id);
  return json.data?.id?.record_id;
}

async function updatePersonWithSentiment(recordId, data) {
  const peopleId = await getObjectIdBySlug("people");
  
  const values = {};
  
  if (data.email && ATTRIBUTE_IDS.email) {
    values[ATTRIBUTE_IDS.email] = [{ email_address: data.email }];
  }
  if (data.role && ATTRIBUTE_IDS.role) {
    values[ATTRIBUTE_IDS.role] = data.role;
  }
  if (data.sentiment && ATTRIBUTE_IDS.sentiment) {
    values[ATTRIBUTE_IDS.sentiment] = data.sentiment;
  }
  if (data.notes && ATTRIBUTE_IDS.notes) {
    // Append to existing notes instead of replacing
    const existing = await getPersonById(recordId);
    const existingNotes = existing?.values?.[ATTRIBUTE_IDS.notes] || "";
    values[ATTRIBUTE_IDS.notes] = existingNotes ? `${existingNotes}\n\n${data.notes}` : data.notes;
  }

  if (Object.keys(values).length === 0) return recordId;

  const payload = JSON.stringify({ data: { values } });

  const res = await fetch(`${ATTIO_API_BASE}/objects/${peopleId}/records/${recordId}`, {
    method: "PATCH",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: payload
  });

  if (!res.ok) {
    const json = await res.json();
    throw new Error(`Failed to update person: ${JSON.stringify(json)}`);
  }

  console.log("✅ Person updated with sentiment:", recordId);
  return recordId;
}

async function getPersonById(recordId) {
  const peopleId = await getObjectIdBySlug("people");
  
  const res = await fetch(`${ATTIO_API_BASE}/objects/${peopleId}/records/${recordId}`, {
    headers: { Authorization: BEARER_TOKEN }
  });

  if (res.ok) {
    const json = await res.json();
    return json.data;
  }
  return null;
}

// ========== RELATIONSHIP MANAGEMENT ==========

async function updateRelationships(data, processedEntities) {
  console.log('🔗 Updating relationships:', data);
  
  // Multi-contact relationship updates
  if (data.contact_updates) {
    for (const update of data.contact_updates) {
      if (processedEntities.people[update.name]) {
        await updatePersonWithSentiment(processedEntities.people[update.name], {
          sentiment: update.sentiment,
          notes: update.context
        });
      }
    }
  }
  
  // Account-level health scoring
  if (data.account_health && data.company && processedEntities.companies[data.company]) {
    await updateCompany(processedEntities.companies[data.company], {
      relationship_health: data.account_health.overall_score,
      expansion_opportunity: data.account_health.expansion_notes,
      churn_risk: data.account_health.risk_level
    });
  }
}

async function linkPersonToCompany(personId, companyId) {
  // This would use Attio's relationship API to link person to company
  console.log(`🔗 Linking person ${personId} to company ${companyId}`);
  // Implementation depends on your Attio workspace setup
}

// ========== ADVANCED TASK MANAGEMENT ==========

async function upsertAdvancedTask(data, processedEntities) {
  console.log('📋 Creating advanced task:', data.description);
  
  const payload = {
    data: {
      content: data.description,
      format: "plaintext",
      deadline_at: data.due_date,
      is_completed: false,
      assignees: data.assignees || []
    }
  };

  // Enhanced linking to multiple entities
  const linkedRecords = [];
  
  if (data.link_to_person_name && processedEntities.people[data.link_to_person_name]) {
    linkedRecords.push({
      target_object: "people",
      target_record_id: processedEntities.people[data.link_to_person_name]
    });
  }
  
  if (data.link_to_company && processedEntities.companies[data.link_to_company]) {
    linkedRecords.push({
      target_object: "companies", 
      target_record_id: processedEntities.companies[data.link_to_company]
    });
  }
  
  if (data.link_to_deal && processedEntities.deals[data.link_to_deal]) {
    linkedRecords.push({
      target_object: "deals",
      target_record_id: processedEntities.deals[data.link_to_deal]
    });
  }

  if (linkedRecords.length > 0) {
    payload.data.linked_records = linkedRecords;
  }

  const res = await fetch(`${ATTIO_API_BASE}/tasks`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
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
    if (dateStr.toLowerCase().includes('q1')) {
      const year = new Date().getFullYear() + (dateStr.includes('next year') ? 1 : 0);
      return new Date(year, 2, 31).toISOString(); // End of Q1
    }
    if (dateStr.toLowerCase().includes('q2')) {
      const year = new Date().getFullYear() + (dateStr.includes('next year') ? 1 : 0);
      return new Date(year, 5, 30).toISOString(); // End of Q2
    }
    if (dateStr.toLowerCase().includes('q3')) {
      const year = new Date().getFullYear() + (dateStr.includes('next year') ? 1 : 0);
      return new Date(year, 8, 30).toISOString(); // End of Q3
    }
    if (dateStr.toLowerCase().includes('q4')) {
      const year = new Date().getFullYear() + (dateStr.includes('next year') ? 1 : 0);
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

async function queryPersonByName(name) {
  const peopleId = await getObjectIdBySlug("people");

  const payload = {
    filter: {
      and: [{
        attribute: ATTRIBUTE_IDS.name,
        query: name
      }]
    },
    limit: 1
  };

  const res = await fetch(`${ATTIO_API_BASE}/objects/${peopleId}/records/query`, {
    method: "POST",
    headers: {
      Authorization: BEARER_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const json = await res.json();
  return json.data && json.data.length > 0 ? json.data[0] : null;
}

async function initializeAttributeIds() {
  try {
    console.log('🔧 Initializing advanced attribute IDs...');
    
    // Load valid stage options first
    await getValidStageOptions();
    
    // Get all object attributes
    const peopleAttrs = await getAttributeIds('people');
    const dealAttrs = await getAttributeIds('deals');
    const companyAttrs = await getAttributeIds('companies');
    
    // Map to our attribute system
    ATTRIBUTE_IDS.email = peopleAttrs.email_addresses;
    ATTRIBUTE_IDS.phone = peopleAttrs.phone_numbers;
    ATTRIBUTE_IDS.notes = peopleAttrs.notes;
    ATTRIBUTE_IDS.role = peopleAttrs.role;
    ATTRIBUTE_IDS.sentiment = peopleAttrs.sentiment;
    
    ATTRIBUTE_IDS.deal_name = dealAttrs.name;
    ATTRIBUTE_IDS.deal_value = dealAttrs.value;
    ATTRIBUTE_IDS.close_date = dealAttrs.close_date;
    ATTRIBUTE_IDS.stage = dealAttrs.stage;
    ATTRIBUTE_IDS.probability = dealAttrs.probability;
    ATTRIBUTE_IDS.competitors = dealAttrs.competitors;
    ATTRIBUTE_IDS.pain_points = dealAttrs.pain_points;
    
    ATTRIBUTE_IDS.company_name = companyAttrs.name;
    ATTRIBUTE_IDS.relationship_health = companyAttrs.relationship_health;
    ATTRIBUTE_IDS.expansion_opportunity = companyAttrs.expansion_opportunity;
    ATTRIBUTE_IDS.churn_risk = companyAttrs.churn_risk;
    
    console.log('✅ Advanced attribute IDs initialized');
    console.log('📋 Available stages:', validStagesCache.stages?.map(s => s.title));
  } catch (err) {
    console.error('❌ Failed to initialize advanced attribute IDs:', err);
  }
}

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
  return attributes;
}

// ========== INTELLIGENCE LAYER ==========

function analyzeDealLanguage(text) {
  const analysis = {
    stage: 'Discovery',
    probability: 50,
    sentiment: 'neutral',
    urgency: 'medium',
    buying_signals: [],
    risk_signals: [],
    competitors: [],
    value_indicators: []
  };

  const lowerText = text.toLowerCase();

  // Stage detection - now uses proper stage names
  for (const [stage, indicators] of Object.entries(DEAL_STAGES)) {
    if (indicators.some(indicator => lowerText.includes(indicator))) {
      analysis.stage = stage;
      break;
    }
  }

  // Sentiment analysis
  const positiveCount = SENTIMENT_INDICATORS.positive.filter(word => lowerText.includes(word)).length;
  const negativeCount = SENTIMENT_INDICATORS.negative.filter(word => lowerText.includes(word)).length;
  
  if (positiveCount > negativeCount) analysis.sentiment = 'positive';
  else if (negativeCount > positiveCount) analysis.sentiment = 'negative';

  // Leading indicators
  analysis.buying_signals = LEADING_INDICATORS.strong_buying_signals.filter(signal => 
    lowerText.includes(signal)
  );
  analysis.risk_signals = LEADING_INDICATORS.risk_signals.filter(signal => 
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
  SENTIMENT_INDICATORS,
  LEADING_INDICATORS,
  mapToValidStage,
  getValidStageOptions
};
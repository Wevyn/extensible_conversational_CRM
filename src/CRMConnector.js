// ========== INTELLIGENT ATTIO CRM PROCESSOR - TEMPLATE BASED ==========
// Uses OpenAPI JSON templates for proper attribute formatting

import openApiSpec from './attio_cleaned_no_country_code.json';

class AttioCRMProcessor {
  
  constructor(attioApiKey, groqApiKey, openApiSpec = null) {
    this.attioApiKey = attioApiKey;
    this.groqApiKey = groqApiKey;
    this.baseUrl = "https://api.attio.com/v2";
    this.headers = {
      "Authorization": `Bearer ${attioApiKey}`,
      "Content-Type": "application/json"
    };
    // in constructor
    this._refIndex = new Map(); // key: `ref:${objectSlug}|${normalizedString}` -> recordId

    this.recordCache = new Map(); // Centralized cache: "objectSlug:identifier" -> recordId
    this.executionOrder = new Map(); // Track creation order for dependencies
    // Store the OpenAPI specification for templates
    this.openApiSpec = openApiSpec;
    
    // Enhanced caching for rate limiting and token conservation
    this.apiResponseCache = new Map(); // Cache API responses with TTL
    this.schemaCache = new Map(); // Cache schema lookups
    this.groqResponseCache = new Map(); // Cache Groq responses for similar inputs
    this.cacheConfig = {
      apiResponseTTL: 5 * 60 * 1000, // 5 minutes for API responses
      groqResponseTTL: 10 * 60 * 1000, // 10 minutes for Groq responses
      maxCacheSize: 1000
    };
    
    // Cache for CRM schema
    this.crmSchema = {
      objects: new Map(),
      attributes: new Map(),
      templates: new Map(), // Templates extracted from OpenAPI
      protectedFields: new Set(), // Fields that shouldn't be modified
      initialized: false
    };
    
    // Define protected fields that should never be modified
    this.crmSchema.protectedFields.add('created_at');
    this.crmSchema.protectedFields.add('updated_at');
    this.crmSchema.protectedFields.add('id');
    this.crmSchema.protectedFields.add('created_by');
    this.crmSchema.protectedFields.add('updated_by');
    this.crmSchema.protectedFields.add('workspace_id');
    this.crmSchema.protectedFields.add('object_id');
    this.crmSchema.protectedFields.add('record_id');
    
    this.rateLimiter = new RateLimiter(50);
  }

  // --- v2 resource support: helpers (ADDED) ---
  isV2Resource(slug) {
    return ['tasks', 'notes', 'emails'].includes(slug);
  }

  getV2Candidates() {
    return ['tasks', 'notes', 'emails'];
  }

  getBaseEndpointFor(slug) {
    if (this.isV2Resource(slug)) return `/${slug}`;
    return `/objects/${slug}/records`;
  }

  getQueryEndpointFor(slug) {
    if (this.isV2Resource(slug)) return `/${slug}`;
    return `/objects/${slug}/records/query`;
  }

  getUpdateEndpointFor(slug, recordId) {
    if (this.isV2Resource(slug)) return `/${slug}/${recordId}`;
    return `/objects/${slug}/records/${recordId}`;
  }

  // ========== STEP 1: DISCOVER CRM SCHEMA + EXTRACT TEMPLATES ==========
  async initializeSchema() {
    if (this.crmSchema.initialized) return;
    
    console.log('🔍 Discovering Attio CRM schema...');
    
    try {
      const objectsResponse = await this.apiCall('/objects');
      const objects = objectsResponse?.data || [];
      
      console.log(`📋 Found ${objects.length} objects:`, objects.map(o => o.api_slug || o.name));
      
      for (const obj of objects) {
        if (!obj?.id?.object_id || !obj?.api_slug) {
          console.warn('⚠️ Skipping object with missing ID or slug:', obj);
          continue;
        }
        
        this.crmSchema.objects.set(obj.api_slug, {
          id: obj.id.object_id,
          slug: obj.api_slug,
          name: obj.name || obj.api_slug,
          type: obj.object_type || 'custom',
          description: obj.description || ''
        });
        
        // Get attributes for this object  
        await this.rateLimiter.wait();
        try {
          const attributesResponse = await this.apiCall(`/objects/${obj.id.object_id}/attributes`);
          const attributes = attributesResponse?.data || [];
          
          const objectAttrs = new Map();
          for (const attr of attributes) {
            if (!attr?.id?.attribute_id || !attr?.api_slug) continue;
            
            objectAttrs.set(attr.api_slug, {
              id: attr.id.attribute_id,
              slug: attr.api_slug,
              name: attr.name || attr.api_slug,
              type: attr.type || 'text',
              required: attr.is_required || false,
              multivalue: attr.is_multivalue || false,
              config: attr.config || {},
              options: attr.options || [],
              full_spec: attr
            });
          }
          
          this.crmSchema.attributes.set(obj.api_slug, objectAttrs);
          
          // Extract template from OpenAPI if available
          if (this.openApiSpec) {
            this.extractTemplateFromOpenApi(obj.api_slug, attributes);
          }
          
          console.log(`  📋 ${obj.api_slug}: ${attributes.length} attributes`);
          
        } catch (attrError) {
          console.warn(`⚠️ Failed to load attributes for ${obj.api_slug}:`, attrError.message);
          this.crmSchema.attributes.set(obj.api_slug, new Map());
        }
      }

      // --- Discover top-level v2 resources using OpenAPI (ADDED) ---
      try {
        const v2List = this.getV2Candidates();

        for (const v2slug of v2List) {
          if (!this.crmSchema.objects.has(v2slug)) {
            this.crmSchema.objects.set(v2slug, {
              id: v2slug,
              slug: v2slug,
              name: v2slug,
              type: 'v2',
              description: `Top-level v2 resource: ${v2slug}`
            });
          }

          if (this.openApiSpec) {
            this.extractV2TemplateFromOpenApi(v2slug);
          }

          if (!this.crmSchema.templates.get(v2slug)) {
            const fallback = {
              title: { type: 'text', required: false, name: 'Title' },
              subject: { type: 'text', required: false, name: 'Subject' },
              content: { type: 'text', required: false, name: 'Content' },
              body: { type: 'text', required: false, name: 'Body' },
              description: { type: 'text', required: false, name: 'Description' },
              due_date: { type: 'text', required: false, name: 'Due date' },
              related_record: {
                type: 'reference',
                required: false,
                name: 'Related',
                config: { target_object: 'deals' }
              }
            };
            this.crmSchema.templates.set(v2slug, fallback);
          }

          if (!this.crmSchema.attributes.has(v2slug)) {
            this.crmSchema.attributes.set(v2slug, new Map());
          }

          console.log(`  📄 v2 resource ready: ${v2slug}`);
        }
      } catch (e) {
        console.warn('⚠️ v2 resource initialization skipped:', e.message);
      }
      
      this.crmSchema.initialized = true;
      console.log(`✅ Schema loaded: ${this.crmSchema.objects.size} objects (incl. v2)`);
      
    } catch (error) {
      console.error('❌ Schema initialization failed:', error);
      throw error;
    }
  }

  extractTemplateFromOpenApi(objectSlug, attributes) {
    if (!this.openApiSpec?.paths) return;
    
    // Look for POST endpoint for this object in OpenAPI spec
    const createEndpoint = `/objects/${objectSlug}/records`;
    const pathSpec = this.openApiSpec.paths[createEndpoint];
    
    if (pathSpec?.post?.requestBody?.content?.['application/json']?.schema) {
      const schema = pathSpec.post.requestBody.content['application/json'].schema;
      
      // Extract the values template structure
      if (schema.properties?.data?.properties?.values?.properties) {
        const valuesTemplate = schema.properties.data.properties.values.properties;
        this.crmSchema.templates.set(objectSlug, valuesTemplate);
        console.log(`📄 Extracted template for ${objectSlug} from OpenAPI`);
      }
    }
    
    // Also look in components/schemas for object definitions
    if (this.openApiSpec.components?.schemas) {
      const objectSchemaKey = Object.keys(this.openApiSpec.components.schemas)
        .find(key => key.toLowerCase().includes(objectSlug.toLowerCase()));
      
      if (objectSchemaKey) {
        const objectSchema = this.openApiSpec.components.schemas[objectSchemaKey];
        if (objectSchema?.properties?.values?.properties) {
          this.crmSchema.templates.set(objectSlug, objectSchema.properties.values.properties);
          console.log(`📄 Found ${objectSlug} template in components/schemas`);
        }
      }
    }
  }

  // (ADDED) v2 template extraction
  extractV2TemplateFromOpenApi(v2slug) {
    if (!this.openApiSpec?.paths) return;

    // Try POST /{v2slug}
    const createEndpoint = `/${v2slug}`;
    const pathSpec = this.openApiSpec.paths[createEndpoint];

    const schema = pathSpec?.post?.requestBody?.content?.['application/json']?.schema;
    if (schema?.properties?.data?.properties?.values?.properties) {
      const valuesTemplate = schema.properties.data.properties.values.properties;
      this.crmSchema.templates.set(v2slug, valuesTemplate);
      console.log(`📄 Extracted v2 template for ${v2slug} from OpenAPI`);
      return;
    }

    // Try components fallback
    if (this.openApiSpec.components?.schemas) {
      const key = Object.keys(this.openApiSpec.components.schemas)
        .find(k => k.toLowerCase().includes(v2slug.toLowerCase()));
      if (key) {
        const objSchema = this.openApiSpec.components.schemas[key];
        if (objSchema?.properties?.values?.properties) {
          this.crmSchema.templates.set(v2slug, objSchema.properties.values.properties);
          console.log(`📄 Found v2 ${v2slug} template in components/schemas`);
        }
      }
    }
  }

  stripLookupValues(obj) {
    if (Array.isArray(obj)) {
      return obj.map(v => this.stripLookupValues(v));
    }

    if (typeof obj === 'object' && obj !== null) {
      const newObj = {};

      for (const [key, value] of Object.entries(obj)) {
        // Remove lookup_value keys from the final payload
        if (key === 'lookup_value') continue;

        const cleaned = this.stripLookupValues(value);
        if (cleaned !== undefined) {
          newObj[key] = cleaned;
        }
      }

      return newObj;
    }

    return obj;
  }

  // ========== STEP 2: LIGHTWEIGHT ENTITY DETECTION ==========
  async processText(inputText) {
    await this.initializeSchema();
    
    console.log('🧠 Processing text with two-phase approach...');
    
    try {
      // Phase 1: Lightweight entity detection
      const entityPlan = await this.detectEntities(inputText);
      
      // Phase 2: Generate specific actions using templates
      const actionPlan = await this.generateActionsWithTemplates(inputText, entityPlan);
      
      // Phase 3: Execute actions
      const results = await this.executeActions(actionPlan);
      
      return {
        success: true,
        entityPlan,
        actionPlan,
        results,
        summary: this.generateSummary(results)
      };
      
    } catch (error) {
      console.error('❌ Text processing failed:', error);
      return {
        success: false,
        error: error.message,
        details: error.stack
      };
    }
  }

  async detectEntities(inputText) {
    // Check cache first for similar inputs to save Groq tokens
    const inputHash = this.hashString(inputText.toLowerCase().trim());
    const cacheKey = `entity_detection:${inputHash}`;
    
    if (this.groqResponseCache.has(cacheKey)) {
      const cached = this.groqResponseCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheConfig.groqResponseTTL) {
        console.log('🎯 Using cached entity detection result');
        return cached.data;
      }
    }
    
    // Simple, lightweight prompt to identify what objects we need
    const availableObjects = Array.from(this.crmSchema.objects.values())
      .map(obj => `${obj.slug}: ${obj.name} (${obj.description})`)
      .slice(0, 10); // Limit to avoid token issues
    
    const prompt = `You are an advanced Attio CRM intelligence assistant. Extract structured data from business conversations with sophisticated deal and relationship insights.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

CRITICAL EXTRACTION RULES:
1. ❌ DO NOT create person objects for teams, roles, or departments:
   - Skip: "Engineering Team", "Legal Team", "Marketing Team", "CTO", "CEO", "VP Sales"
   - Instead: Add team/role info to individual person's notes or role field
2. ✅ DO create person objects only for named individuals:
   - "Lisa from marketing" ✅
   - "Dave in procurement" ✅  
   - "Engineering Team" ❌
3. 🔄 For updating existing people, always include identifying info (email preferred)
4. 🎯 Use ONLY these valid deal stages (case sensitive):
   - "Lead", "In Progress", "Won", "Lost"
5. 🔗 Link deals to companies and decision makers when possible
6. 📋 Create follow-up tasks for implied next steps (use the 'tasks' v2 resource where appropriate)
7. 💼 Support employee-employee CRM with internal stakeholder tracking

🚨 CRITICAL PAYLOAD STRUCTURE RULES:
- ALL deal attributes (name, stage, value, owner, etc.) go inside data.values object
- NEVER put associated_company or associated_people outside values - they go INSIDE values
- For deals: value should be a simple number like "value": 150000, NOT an object with currency
- Currency fields are NOT supported - omit them completely
- Example correct deal structure:
  {
    "data": {
      "values": {
        "name": "Deal Name",
        "stage": "Lead", 
        "value": 150000,
        "associated_company": {...},
        "associated_people": [...]
      }
    }
  }

INPUT: "${inputText}"

AVAILABLE CRM OBJECTS:
${availableObjects.join('\n')}

🚨 TASK CREATION TEMPLATE: 
TASK OBJECT (use this structure for tasks-related extracted_info):
{
  "type": "task",
  "name": "Task Name",
  "description": "Detailed task description",
  "due_date": "YYYY-MM-DDThh:mm:ssZ",
  "priority": "high|medium|low",
  "link_to_person_name": "Person Name",
  "link_to_company": "Company Name",
  "link_to_deal": "Deal Name",
  "task_type": "follow_up|demo|proposal|contract_review"
}

🚨 DEAL CREATION RULES - BE CONSERVATIVE:
ONLY create deals when there are CLEAR business opportunity indicators:
✅ CREATE DEAL when conversation mentions:
   - Specific budget amounts ("$150K approved")
   - Purchase timeline ("need by Q1")
   - Active negotiations ("reviewing proposal")
   - RFP/procurement process ("sending requirements")
   - Product evaluation ("testing your solution")
   - Competitive comparison ("comparing you to X")
   - Contract discussions ("legal is reviewing")
   - Buying committee involvement ("presenting to board")

❌ DO NOT CREATE DEAL for:
   - Simple contact information updates
   - General relationship building conversations
   - Product inquiries without buying intent
   - Networking/introductory calls
   - Support/service conversations
   - Employee onboarding information
   - Generic company information updates

EXAMPLES OF WHEN NOT TO CREATE DEALS:
❌ "John's email is john@company.com" → Just update person
❌ "Had a great conversation with Lisa" → Just update relationship
❌ "Met the new CTO at the conference" → Just create person
❌ "Their office moved to downtown" → Just update company info

EXAMPLES OF WHEN TO CREATE DEALS:
✅ "They want a proposal for $100K by next month"
✅ "Budget approved, looking to implement Q1"
✅ "Comparing our solution vs competitors"
✅ "Legal team reviewing our contract terms"

🎯 CONSERVATIVE APPROACH:
- Only suggest "companies" if a specific company is mentioned
- Only suggest "people" if named individuals are mentioned (not teams/roles)
- Only suggest "deals" if there are clear buying signals or business opportunities
- Suggest "tasks" or "notes" (v2 resources) when follow-ups, to-dos, or summarization/annotation are implied

Respond with ONLY a JSON object like this:
{
  "entities": [
    {
      "object_slug": "companies", 
      "reason": "Mentioned specific company name",
      "extracted_info": {"name": "Acme Corp"},
      "confidence": "high|medium|low"
    },
    {
      "object_slug": "people",
      "reason": "Named individual mentioned", 
      "extracted_info": {"name": "John Doe", "email": "john@acme.com"},
      "confidence": "high|medium|low"
    },
    {
      "object_slug": "tasks",
      "reason": "Implied next step or follow-up",
      "extracted_info": {"title": "Follow up with John re: budget", "due_date": "YYYY-MM-DD"},
      "confidence": "high|medium|low"
    }
  ],
  "sentiment": "positive|neutral|negative",
  "urgency": "high|medium|low",
  "follow_up_needed": true|false,
  "business_context": "contact_update|deal_opportunity|relationship_building|support"
}`;

    console.log('🔍 Phase 1: Detecting entities...');
    
    const groqResponse = await this.callGroq(prompt, {
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(groqResponse);
    
    // Cache the result
    this.groqResponseCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });
    
    // Clean up cache if it gets too big
    if (this.groqResponseCache.size > this.cacheConfig.maxCacheSize) {
      this.cleanupCache(this.groqResponseCache);
    }
    
    return result;
  }

  async generateActionsWithTemplates(inputText, entityPlan) {
    const actions = [];
    const dependencies = new Map(); // Track what depends on what
    
    // Process all entities and determine execution order
    const sortedEntities = this.determineDependencyOrder(entityPlan.entities || []);
    
    for (const entity of sortedEntities) {
      const entityActions = await this.generateObjectActions(inputText, {
        object_slug: entity.object_slug,
        template: this.getTemplateForObject(entity.object_slug),
        extracted_info: entity.extracted_info,
        reason: entity.reason,
        dependencies: this.findDependencies(entity, entityPlan.entities)
      });
      actions.push(...entityActions);
    }
    
    return {
      analysis: {
        entities_found: (entityPlan.entities || []).map(e => `${e.object_slug}: ${JSON.stringify(e.extracted_info)}`),
        sentiment: entityPlan.sentiment,
        urgency: entityPlan.urgency,
        follow_up_needed: entityPlan.follow_up_needed
      },
      actions
    };
  }

  determineDependencyOrder(entities) {
    // Get attributes for all entities to understand their reference relationships
    const entityDeps = new Map();
    
    for (const entity of entities) {
      const attributes = this.crmSchema.attributes.get(entity.object_slug);
      const deps = [];
      
      if (attributes) {
        for (const [fieldSlug, attr] of attributes) {
          if (this.isReferenceFieldType(attr.type)) {
            const targetObject = this.getTargetObjectFromType(attr.type, attr.config);
            const referencedEntity = entities.find(e => e.object_slug === targetObject);
            if (referencedEntity) {
              deps.push(targetObject);
            }
          }
        }
      }
      
      entityDeps.set(entity.object_slug, deps);
    }
    
    // Simple topological sort - entities with no dependencies first
    const sorted = [];
    const processed = new Set();
    
    while (sorted.length < entities.length) {
      for (const entity of entities) {
        if (processed.has(entity.object_slug)) continue;
        
        const deps = entityDeps.get(entity.object_slug) || [];
        const allDepsProcessed = deps.every(dep => processed.has(dep));
        
        if (allDepsProcessed) {
          sorted.push(entity);
          processed.add(entity.object_slug);
        }
      }
    }
    
    return sorted;
  }

  getTemplateForObject(objectSlug) {
    const template = this.crmSchema.templates.get(objectSlug);
    const attributes = this.crmSchema.attributes.get(objectSlug);
    
    return template || this.buildAttributeTemplate(attributes);
  }

  findDependencies(entity, allEntities) {
    const deps = {};
    const attributes = this.crmSchema.attributes.get(entity.object_slug);
    
    if (!attributes) return deps;
    
    // Find reference fields in this entity's attributes
    for (const [fieldSlug, attr] of attributes) {
      if (this.isReferenceFieldType(attr.type)) {
        const targetObject = this.getTargetObjectFromType(attr.type, attr.config);
        
        // Look for an entity of that target type in our current batch
        const referencedEntity = allEntities.find(e => e.object_slug === targetObject);
        if (referencedEntity) {
          deps[fieldSlug] = {
            target_object: targetObject,
            extracted_info: referencedEntity.extracted_info
          };
        }
      }
    }
    
    return deps;
  }

  buildAttributeTemplate(attributes) {
    const template = {};
    if (!attributes) return template;
    
    for (const [slug, attr] of attributes) {
      const templateField = {
        type: attr.type,
        required: attr.required,
        multivalue: attr.multivalue,
        name: attr.name,
        description: attr.description || attr.full_spec?.description
      };

      // Add configuration details for complex types
      if (attr.config && Object.keys(attr.config).length > 0) {
        templateField.config = attr.config;
      }

      // Add options for select fields
      if (attr.options && attr.options.length > 0) {
        templateField.options = attr.options.map(opt => ({
          id: opt.id,
          title: opt.title || opt.name,
          value: opt.value
        }));
      }

      // For reference fields, add target information
      if (this.isReferenceFieldType(attr.type)) {
        templateField.reference_info = {
          target_object: this.getTargetObjectFromType(attr.type, attr.config),
          format: attr.multivalue ? 
            [{"target_object": "object_slug", "target_record_id": "PLACEHOLDER_UUID", "lookup_value": "entity_name"}] :
            {"target_object": "object_slug", "target_record_id": "PLACEHOLDER_UUID", "lookup_value": "entity_name"}
        };
      }

      // Add format hints for structured types
      if (attr.type === 'email') {
        templateField.format = attr.multivalue ? 
          [{"email_address": "email@domain.com"}] : 
          {"email_address": "email@domain.com"};
      } else if (attr.type === 'phone') {
        templateField.format = attr.multivalue ? 
          [{"original_phone_number": "+1234567890", "country_code": "US"}] : 
          {"original_phone_number": "+1234567890", "country_code": "US"};
      } else if (attr.type === 'person_name') {
        templateField.format = attr.multivalue ? 
          [{"first_name": "First", "last_name": "Last", "full_name": "First Last"}] : 
          {"first_name": "First", "last_name": "Last", "full_name": "First Last"};
      } else if (attr.type === 'location') {
        templateField.format = attr.multivalue ? 
          [{"line_1": "Street Address", "city": "City", "country_code": "US"}] : 
          {"line_1": "Street Address", "city": "City", "country_code": "US"};
      }
      
      template[slug] = templateField;
    }
    
    return template;
  }

  isReferenceFieldType(type) {
    return type && (type.includes('reference') || type.includes('relation'));
  }

  // --- ensure v2 payload matches Attio /v2/<slug> shape ---
  normalizeV2Body(slug, payload) {
    if (!this.isV2Resource(slug) || !payload?.data) return payload;

    // If the model or transformer put fields under data.values, hoist them.
    const values = payload.data.values && typeof payload.data.values === 'object'
      ? payload.data.values
      : null;

    const body = { data: {} };

    // If values exists and looks like v2 task body, hoist it; else keep existing data fields.
    if (values) {
      Object.assign(body.data, values);
    } else {
      Object.assign(body.data, payload.data);
    }

    // Required v2 fields & defaults
    if (slug === 'tasks') {
      // content must be a string (you handled name/description in the prompt)
      if (typeof body.data.content !== 'string') body.data.content = '';

      // deadline_at: allow YYYY-MM-DD and normalize to midnight Z
      if (body.data.deadline_at && /^\d{4}-\d{2}-\d{2}$/.test(body.data.deadline_at)) {
        body.data.deadline_at = `${body.data.deadline_at}T00:00:00Z`;
      }

      // Attio requires these to exist
      if (body.data.format !== 'plaintext') body.data.format = 'plaintext';
      if (typeof body.data.is_completed !== 'boolean') body.data.is_completed = false;
      if (!Array.isArray(body.data.linked_records)) body.data.linked_records = [];
      if (!Array.isArray(body.data.assignees)) body.data.assignees = [];

      // Remove lookup_value from linked_records (server only wants target_object + target_record_id)
      body.data.linked_records = body.data.linked_records
        .filter(x => x && x.target_object && x.target_record_id)
        .map(x => ({
          target_object: x.target_object,
          target_record_id: this.extractRecordId(x.target_record_id)
        }));
    }

    // Final: make sure we’re not sending data.values anymore
    delete body.data.values;
    return body;
  }


  getTargetObjectFromType(type, config) {
    // First check config for explicit target
    if (config?.target_object) return config.target_object;
    
    // Check if config has object_id and find the matching object
    if (config?.object_id) {
      for (const [slug, obj] of this.crmSchema.objects) {
        if (obj.id === config.object_id) {
          return slug;
        }
      }
    }
    
    // Try to infer from type name
    const lowerType = (type || '').toLowerCase();
    for (const [slug] of this.crmSchema.objects) {
      if (lowerType.includes(slug) || lowerType.includes(slug.slice(0, -1))) {
        return slug;
      }
    }
    
    console.warn(`⚠️ Could not determine target object for type ${type}, using first available object`);
    return Array.from(this.crmSchema.objects.keys())[0];
  }

  async generateObjectActions(inputText, objectContext) {
    // Filter out protected fields from the template
    const filteredTemplate = this.filterProtectedFields(objectContext.template);

    // NOTE: dynamic endpoint injection so the LLM emits /tasks for v2 and /objects/<slug>/records for objects
    const baseEndpointForObject = this.getBaseEndpointFor(objectContext.object_slug);
    const prompt = `You are an advanced Attio CRM intelligence assistant. Generate CRM actions for this object using the provided OpenAPI schema and attribute template.

    CURRENT DATE: ${new Date().toISOString().split('T')[0]}
    (Use this as the reference point for all date interpretations)

    CONTEXT:
    - OBJECT: ${objectContext.object_slug}
    - EXTRACTED INFO: ${JSON.stringify(objectContext.extracted_info)}
    - REASON: ${objectContext.reason}
    - DEPENDENCIES: ${JSON.stringify(objectContext.dependencies || {})}

    CRITICAL CREATION RULES:
    1. ❌ DO NOT create person objects for teams, roles, or departments
    2. ✅ DO create person objects only for named individuals
    3. 🎯 For updating existing records, always include identifying info
    4. 🔄 Use "update_if_exists": true when possible to prevent duplicates
    5. ⚠️ NEVER include protected fields like created_at, updated_at, id, etc.
    6. 🔍 For reference fields, use smart lookup with actual entity names from input text

    INPUT TEXT:
    "${inputText}"

    ATTRIBUTE TEMPLATE (PROTECTED FIELDS ALREADY REMOVED):
    ${JSON.stringify(filteredTemplate, null, 2)}

    FORMATTING RULES:
    - Use correct attribute names and value types from ATTRIBUTE TEMPLATE.
    - For reference fields, format as:
      {
        "target_object": "target_object_slug",
        "target_record_id": "PLACEHOLDER_UUID",
        "lookup_value": "Actual Entity Name From Input Text"
      }
    - IMPORTANT: Extract actual entity names from input text for lookup_value.
    - Do NOT resolve UUIDs — just use placeholders. The system will resolve them later.
    - Use "update_if_exists": true when possible.
    - Do not hallucinate extra attributes.
    - If any attribute is defined as a type "array", generate its value as an array.
    - Always check if a field is multivalue and wrap single values in arrays accordingly.

    SMART DEDUPLICATION:
    - Use the most unique identifier available for search_criteria.
    - Extract actual entity names from input text.

    RETURN FORMAT (EXACTLY THIS):
    {
      "actions": [
        {
          "action_type": "smart_check_existing",
          "object_slug": "${objectContext.object_slug}",
          "endpoint": "${baseEndpointForObject}",
          "search_criteria": {"most_unique_field": "search_value"},
          "search_terms": ["actual", "names", "from", "input"],
          "priority": 1
        },
        {
          "action_type": "create_record",
          "object_slug": "${objectContext.object_slug}",
          "endpoint": "${baseEndpointForObject}",
          "update_if_exists": true,
          "search_criteria": {"same_field": "same_value"},
          "payload": {
            "data": {
              "values": {
                "exact_field_name": "properly_formatted_value_matching_template"
              }
            }
          },
          "priority": 2
        }
      ]
    }

    SPECIAL RULES FOR TASKS:
    - If OBJECT is "tasks", format the payload's data.values to match the TASK OBJECT exactly:
      {
        "data": {
          "content": "task content",
          "format": "plaintext",
          "deadline_at": "YYYY-MM-DDThh:mm:ssZ",
          "is_completed": false,
          "linked_records": [
            {
              "target_object": "people|companies|deals",
              "target_record_id": "PLACEHOLDER_UUID",
              "lookup_value": "<Person Name>" or "<Company Name>" or "<Deal Name>"
            }
          ],
          "assignees": []
        }
      }
    - Do NOT invent extra fields.
    - If a link is unknown, omit that specific link field rather than guessing.
    - "content" MUST be non-empty. If input is vague, synthesize a concise, accurate action title (e.g., "Follow up on Q3 planning concerns") and a one-sentence description joined with an em dash.

    EXAMPLES:

    // Example A: people (regular object)
    INPUT CONTEXT → OBJECT: people
    Expected "actions" (shape):
    {
      "actions": [
        {
          "action_type": "smart_check_existing",
          "object_slug": "people",
          "endpoint": "/objects/people/records",
          "search_criteria": {"name": "Dave"},
          "search_terms": ["Dave", "Procurement"],
          "priority": 1
        },
        {
          "action_type": "create_record",
          "object_slug": "people",
          "endpoint": "/objects/people/records",
          "update_if_exists": true,
          "search_criteria": {"name": "Dave"},
          "payload": {
            "data": {
              "values": {
                "name": "Dave",
                "role": "Procurement",
                "notes": "Skeptical about Q3 planning"
              }
            }
          },
          "priority": 2
        }
      ]
    }

    // Example B: tasks (v2)
    INPUT CONTEXT → OBJECT: tasks
    Expected "actions" (shape):
    {
      "actions": [
        {
          "action_type": "smart_check_existing",
          "object_slug": "tasks",
          "endpoint": "/tasks",
          "search_criteria": {"content": "Follow up on Q3 planning concerns"},
          "search_terms": ["Q3 planning", "follow up", "Dave"],
          "priority": 1
        },
        {
          "action_type": "create_record",
          "object_slug": "tasks",
          "endpoint": "/tasks",
          "update_if_exists": true,
          "search_criteria": {"content": "Follow up on Q3 planning concerns"},
          "payload": {
            "data": {
              "values": {
                "content": "Follow up on Q3 planning concerns — address Dave's skepticism and gather specific blockers",
                "format": "plaintext",
                "deadline_at": "YYYY-MM-DDT00:00:00Z",
                "is_completed": false,
                "linked_records": [
                  {
                    "target_object": "people",
                    "target_record_id": "PLACEHOLDER_UUID",
                    "lookup_value": "Dave"
                  }
                ],
                "assignees": []
              }
            }
          },
          "priority": 2
        }
      ]
    }`; 



    console.log(`🔧 Generating actions for ${objectContext.object_slug}...`);
    
    const groqResponse = await this.callGroq(prompt, {
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      response_format: { type: "json_object" }
    });
    
    const response = JSON.parse(groqResponse);
    
    // Remove owner field for deals
    if (objectContext.object_slug === 'deals') {
      response.actions?.forEach(action => {
        if (action.payload?.data?.values?.owner) {
          delete action.payload.data.values.owner;
          console.log('🚫 Removed owner field from deal payload (using Attio default)');
        }
      });
    }
    
    return response.actions || [];
  }

  // New method to filter out protected fields
  filterProtectedFields(template) {
    if (!template) return template;
    
    const filtered = {};
    for (const [key, value] of Object.entries(template)) {
      if (!this.crmSchema.protectedFields.has(key)) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  // ========== ENHANCED RECORD RESOLUTION WITH DYNAMIC FIELD SEARCH ==========
  async findRecordByField(objectSlug, searchField, searchValue) {
    try {
      console.log(`🔍 Looking for ${objectSlug} where ${searchField} = ${searchValue}`);
      
      const response = await this.apiCall(this.getQueryEndpointFor(objectSlug), 'POST', {
        "limit": 100
      });
      const records = response?.data || [];
      
      for (const record of records) {
        const values = record.values || {};
        const fieldValue = values[searchField];
        
        if (this.valueMatches(fieldValue, searchValue)) {
          console.log(`✅ Found existing ${objectSlug} record:`, record.id);
          return record.id?.record_id || record.id;
        }
      }
      
      console.log(`❌ No ${objectSlug} found with ${searchField} = ${searchValue}`);
      return null;
    } catch (error) {
      console.error(`Error searching for ${objectSlug}:`, error);
      return null;
    }
  }

  // Dynamic smart search that works with any object type
  async smartSearchByName(objectSlug, searchTerms) {
    try {
      console.log(`🔍 Smart searching ${objectSlug} for terms:`, searchTerms);
      
      const response = await this.apiCall(this.getQueryEndpointFor(objectSlug), 'POST', {
        "limit": 100
      });
      const records = response?.data || [];
      
      // Try exact matches first
      for (const searchTerm of searchTerms) {
        for (const record of records) {
          if (this.recordMatchesName(record, objectSlug, searchTerm, true)) { // exact match
            const recordId = this.extractRecordId(record.id);
            console.log(`✅ Found exact match for "${searchTerm}":`, recordId);
            return recordId;
          }
        }
      }
      
      // Then try partial matches
      for (const searchTerm of searchTerms) {
        for (const record of records) {
          if (this.recordMatchesName(record, objectSlug, searchTerm, false)) { // partial match
            const recordId = this.extractRecordId(record.id);
            console.log(`✅ Found partial match for "${searchTerm}":`, recordId);
            return recordId;
          }
        }
      }
      
      console.log(`❌ No ${objectSlug} found matching any of:`, searchTerms);
      return null;
    } catch (error) {
      console.error(`Error in smart search for ${objectSlug}:`, error);
      return null;
    }
  }

  recordMatchesName(record, objectSlug, searchTerm, exactMatch = false) {
    const values = record.values || {};
    const searchLower = (searchTerm || '').toLowerCase().trim();
    
    // Get searchable fields for this object dynamically
    const searchableFields = this.getSearchableFieldsForObject(objectSlug);
    
    for (const field of searchableFields) {
      const value = values[field];
      
      if (this.isSimpleStringValue(value)) {
        const valueLower = value.toLowerCase().trim();
        if (exactMatch) {
          if (valueLower === searchLower) return true;
        } else {
          if (valueLower.includes(searchLower) || searchLower.includes(valueLower)) return true;
        }
      }
      
      if (this.isNameObject(value) && value.full_name) {
        const fullNameLower = value.full_name.toLowerCase().trim();
        if (exactMatch) {
          if (fullNameLower === searchLower) return true;
        } else {
          if (fullNameLower.includes(searchLower) || searchLower.includes(fullNameLower)) return true;
        }
      }
      
      if (Array.isArray(value)) {
        for (const item of value) {
          if (this.isSimpleStringValue(item)) {
            const itemLower = item.toLowerCase().trim();
            if (exactMatch) {
              if (itemLower === searchLower) return true;
            } else {
              if (itemLower.includes(searchLower) || searchLower.includes(itemLower)) return true;
            }
          }
        }
      }
    }
    
    return false;
  }

  getSearchableFieldsForObject(objectSlug) {
    const attributes = this.crmSchema.attributes.get(objectSlug);
    if (!attributes || attributes.size === 0) {
      // v2-safe defaults so name-search still works for tasks/notes/emails
      return ['name', 'title', 'subject', 'content', 'body', 'description', 'full_name'];
    }
    
    const searchableFields = [];
    
    for (const [slug, attr] of attributes) {
      // Include text fields and person_name fields
      if (attr.type === 'text' || attr.type === 'person_name' || 
          slug.includes('name') || slug.includes('title') || slug.includes('domain')) {
        searchableFields.push(slug);
      }
    }
    
    return searchableFields;
  }

  valueMatches(fieldValue, searchValue) {
    if (!fieldValue || !searchValue) return false;
    
    const searchLower = String(searchValue).toLowerCase();
    
    // Handle different field value structures
    if (typeof fieldValue === 'string') {
      return fieldValue.toLowerCase().includes(searchLower);
    }
    
    if (Array.isArray(fieldValue)) {
      return fieldValue.some(item => {
        if (typeof item === 'string') {
          return item.toLowerCase().includes(searchLower);
        }
        if (typeof item === 'object' && item !== null) {
          // Check all string fields in the object
          for (const [, value] of Object.entries(item)) {
            if (typeof value === 'string' && value.toLowerCase().includes(searchLower)) {
              return true;
            }
          }
        }
        return false;
      });
    }
    
    if (typeof fieldValue === 'object' && fieldValue !== null) {
      // Check all string fields in the object
      for (const [, value] of Object.entries(fieldValue)) {
        if (typeof value === 'string' && value.toLowerCase().includes(searchLower)) {
          return true;
        }
      }
    }
    
    return false;
  }

  // ========== ACTION EXECUTION WITH PROPER REFERENCE RESOLUTION ==========
  async executeActions(actionPlan) {
    const results = [];
    const recordCreationMap = new Map(); // Track what we've created: object:searchKey -> recordId
    
    // Sort by priority
    const sortedActions = this.sortActionsByDependencies(actionPlan.actions || []);
    
    for (const action of sortedActions) {
      try {
        console.log(`🔧 Executing: ${action.action_type} on ${action.object_slug}`);
        
        let result;
        
        switch (action.action_type) {
          case 'check_existing':
            result = await this.checkExistingRecord(action);
            
            // Cache found records for later reference resolution
            if (result.found && result.record_ids.length > 0) {
              const recordId = result.record_ids[0];
              this.cacheRecordForLookup(action.object_slug, action.search_criteria, recordId);
            }
            break;

          case 'smart_check_existing':
            result = await this.smartCheckExisting(action);
            
            // Cache found records for later reference resolution
            if (result.found && result.record_ids.length > 0) {
              const recordId = result.record_ids[0];
              this.cacheRecordForLookup(action.object_slug, action.search_criteria, recordId);
              // Also cache by search terms for smart lookup
              if (action.search_terms) {
                for (const term of action.search_terms) {
                  this.cacheRecordValue(action.object_slug, term, recordId);
                }
              }
            }
            break;
            
          case 'create_record':
            result = await this.createOrUpdateRecordFixed(action, recordCreationMap);
            break;
            
          default:
        }
        
        results.push({
          action: action.action_type,
          object: action.object_slug,
          success: true,
          result,
          reasoning: action.reasoning || 'Action completed'
        });
        
        await this.rateLimiter.wait();
        
      } catch (error) {
        console.error(`❌ Action failed: ${action.action_type}`, error);
        results.push({
          action: action.action_type,
          object: action.object_slug,
          success: false,
          error: error.message,
          reasoning: action.reasoning || 'Action failed'
        });
      }
    }
    
    return results;
  }

  // Smart check existing method
  async smartCheckExisting(action) {
    try {
      console.log(`🔍 Smart checking for existing ${action.object_slug}`);
      
      // First try regular search criteria
      const regularResult = await this.checkExistingRecord(action);
      if (regularResult.found) {
        return regularResult;
      }
      
      // Then try smart name search with search terms
      if (action.search_terms && action.search_terms.length > 0) {
        const recordId = await this.smartSearchByName(action.object_slug, action.search_terms);
        if (recordId) {
          return {
            found: true,
            matches: [{ id: recordId }],
            count: 1,
            record_ids: [recordId],
            method: 'smart_name_search'
          };
        }
      }
      
      return { found: false, matches: [], count: 0, method: 'smart_check' };
      
    } catch (error) {
      console.error('Error in smart check existing:', error);
      return { found: false, matches: [], count: 0, error: error.message };
    }
  }

  async createOrUpdateRecordFixed(action, recordCreationMap) {
    const objectSlug = action.object_slug;
    
    // Step 1: Check if we should update existing record
    const searchCriteria = action.search_criteria || {};
    let existingRecordId = this.findCachedRecordId(objectSlug, searchCriteria);
    
    // Enhanced check: Also search for existing records by the search criteria
    if (!existingRecordId && Object.keys(searchCriteria).length > 0) {
      console.log(`🔍 Checking for existing ${objectSlug} with criteria:`, searchCriteria);
      const checkResult = await this.checkExistingRecord(action);
      if (checkResult.found && checkResult.record_ids.length > 0) {
        existingRecordId = checkResult.record_ids[0];
        // Cache this found record for future use
        this.cacheRecordForLookup(objectSlug, searchCriteria, existingRecordId);
        console.log(`✅ Found existing ${objectSlug} record: ${existingRecordId}`);
      }
    }
    
    // Step 2: Resolve references in payload using our creation map and cache
    const resolvedPayload = await this.resolveReferencesEnhanced(action.payload, recordCreationMap);
    const finalPayload = this.isV2Resource(objectSlug)
    ? this.normalizeV2Body(objectSlug, resolvedPayload)
    : resolvedPayload;


    let result;
    
    if (existingRecordId && action.update_if_exists !== false) {
      // Update existing record
      console.log(`📝 Updating existing ${objectSlug} record: ${existingRecordId}`);
      const updateEndpoint = this.getUpdateEndpointFor(objectSlug, existingRecordId); // (CHANGED)
      result = await this.apiCall(updateEndpoint, 'PATCH', finalPayload);
      
      // Update our creation map
      const searchKey = this.buildSearchKey(searchCriteria);
      recordCreationMap.set(`${objectSlug}:${searchKey}`, existingRecordId);
      
    } else {
      // Create new record
      console.log(`➕ Creating new ${objectSlug} record`);
      result = await this.apiCall(action.endpoint, 'POST', finalPayload);
      
      // Cache the newly created record for future reference resolution
      if (result?.data?.id) {
        const newRecordId = this.extractRecordId(result.data.id);
        const searchKey = this.buildSearchKey(searchCriteria);
        recordCreationMap.set(`${objectSlug}:${searchKey}`, newRecordId);
        
        // Also cache by the values we just created for lookup resolution
        this.cacheCreatedRecordValuesEnhanced(objectSlug, resolvedPayload.data?.values, newRecordId);
        
        console.log(`✅ Created ${objectSlug} record ${newRecordId}, cached as ${objectSlug}:${searchKey}`);
      }
    }
    
    return result;
  }

  // Enhanced reference resolution
  async resolveReferencesEnhanced(payload, recordCreationMap) {
    if (!payload?.data?.values) return payload;
    
    const resolvedValues = {};
    
    for (const [fieldSlug, value] of Object.entries(payload.data.values)) {
      if (this.isPlaceholderReference(value)) {
        // Single reference
        const resolved = await this.resolveReferenceItemEnhanced(value, recordCreationMap, fieldSlug);
        if (resolved) {
          resolvedValues[fieldSlug] = resolved;
        } else {
          console.warn(`⚠️ Could not resolve reference for ${fieldSlug}, skipping field`);
        }
      } else if (Array.isArray(value) && value.some(v => this.isPlaceholderReference(v))) {
        // Array of references
        const resolvedArray = [];
        for (const item of value) {
          if (this.isPlaceholderReference(item)) {
            const resolved = await this.resolveReferenceItemEnhanced(item, recordCreationMap, fieldSlug);
            if (resolved) resolvedArray.push(resolved);
          } else {
            resolvedArray.push(item);
          }
        }
        if (resolvedArray.length > 0) {
          resolvedValues[fieldSlug] = resolvedArray;
        }
      } else {
        // Not a reference, keep as-is
        resolvedValues[fieldSlug] = value;
      }
    }
    
    return {
      ...payload,
      data: {
        ...payload.data,
        values: resolvedValues
      }
    };
  }

  async resolveReferenceItemEnhanced(refItem, recordCreationMap, fieldSlug) {
    if (!this.isPlaceholderReference(refItem)) {
      return refItem; // Already resolved
    }
    
    const { target_object, lookup_value } = refItem;
    
    if (!lookup_value) {
      console.warn(`⚠️ Missing lookup_value in reference for ${fieldSlug}`);
      return null;
    }
    
    console.log(`🔍 Resolving reference: ${fieldSlug} -> ${target_object} with lookup "${lookup_value}"`);
    
    // Step 1: Try to find in our creation map
    let recordId = this.findInCreationMap(target_object, lookup_value, recordCreationMap);
    
    // Step 2: Try cache
    if (!recordId) {
      recordId = this.findInCache(target_object, lookup_value);
    }
    
    // Step 3: Smart search API with the lookup value
    if (!recordId) {
      console.log(`🔍 Smart searching API for ${target_object} with lookup "${lookup_value}"`);
      recordId = await this.smartSearchByName(target_object, [lookup_value]);
      
      if (recordId) {
        // Cache it for future use
        this.cacheRecordValue(target_object, lookup_value, recordId);
      }
    }
    
    if (!recordId || !this.isValidUUID(recordId)) {
      console.error(`❌ Could not resolve reference: ${fieldSlug} -> ${target_object} with lookup "${lookup_value}"`);
      return null;
    }
    
    console.log(`✅ Resolved ${fieldSlug}: ${lookup_value} -> ${recordId}`);
    
    // Return resolved reference without lookup_value
    return {
      target_object,
      target_record_id: recordId
    };
  }

  findInCreationMap(targetObject, lookupValue, recordCreationMap) {
    const lookupLower = (lookupValue || '').toLowerCase();
    
    for (const [key, recordId] of recordCreationMap.entries()) {
      if (key.startsWith(`${targetObject}:`)) {
        const searchKey = key.substring(`${targetObject}:`.length);
        if (searchKey.toLowerCase().includes(lookupLower) || lookupLower.includes(searchKey.toLowerCase())) {
          console.log(`✅ Found in creation map: ${key} → ${recordId}`);
          return recordId;
        }
      }
    }
    
    return null;
  }

  findInCache(targetObject, lookupValue) {
    const directKey = `${targetObject}:${lookupValue}`;
    if (this.recordCache.has(directKey)) {
      console.log(`✅ Found in cache: ${directKey}`);
      return this.recordCache.get(directKey);
    }
    
    const lookupLower = (lookupValue || '').toLowerCase();
    for (const [cacheKey, recordId] of this.recordCache.entries()) {
      if (cacheKey.startsWith(`${targetObject}:`) && 
          (cacheKey.toLowerCase().includes(lookupLower) || lookupLower.includes(cacheKey.toLowerCase()))) {
        console.log(`✅ Found partial match in cache: ${cacheKey} → ${recordId}`);
        return recordId;
      }
    }
    
    return null;
  }

  cacheRecordValue(targetObject, lookupValue, recordId) {
    const cacheKey = `${targetObject}:${lookupValue}`;
    this.recordCache.set(cacheKey, recordId);
    console.log(`📌 Cached: ${cacheKey} → ${recordId}`);
  }

  buildSearchKey(searchCriteria) {
    if (!searchCriteria || Object.keys(searchCriteria).length === 0) {
      return 'unknown';
    }
    
    return Object.values(searchCriteria).join('|');
  }

  findCachedRecordId(objectSlug, searchCriteria) {
    const searchKey = this.buildSearchKey(searchCriteria);
    return this.recordCache.get(`${objectSlug}:${searchKey}`);
  }

  cacheRecordForLookup(objectSlug, searchCriteria, recordId) {
    const searchKey = this.buildSearchKey(searchCriteria);
    const cacheKey = `${objectSlug}:${searchKey}`;
    this.recordCache.set(cacheKey, recordId);
    console.log(`📌 Cached: ${cacheKey} → ${recordId}`);
  }

  cacheCreatedRecordValuesEnhanced(objectSlug, values, recordId) {
    if (!values || !recordId) return;
    
    const actualRecordId = this.extractRecordId(recordId);
    
    if (!actualRecordId || !this.isValidUUID(actualRecordId)) {
      console.warn(`⚠️ Invalid record ID for caching: ${recordId}`);
      return;
    }
    
    // Cache by searchable fields for this object
    const searchableFields = this.getSearchableFieldsForObject(objectSlug);
    
    for (const field of searchableFields) {
      const value = values[field];
      if (this.isSimpleStringValue(value)) {
        this.cacheRecordValue(objectSlug, value, actualRecordId);
      } else if (this.isNameObject(value) && value.full_name) {
        this.cacheRecordValue(objectSlug, value.full_name, actualRecordId);
      }
    }
    
    console.log(`📌 Enhanced caching completed for ${objectSlug} record ${actualRecordId}`);
  }

  // ========== UTILITY HELPERS ==========
  isReferenceField(attribute) {
    if (!attribute) return false;
    return this.isReferenceFieldType(attribute.type);
  }

  isPlaceholderReference(value) {
    return (
      value &&
      typeof value === 'object' &&
      value.target_record_id === 'PLACEHOLDER_UUID' &&
      value.lookup_value
    );
  }

  isSimpleStringValue(value) {
    return typeof value === 'string' && value.length > 0;
  }

  isNameObject(value) {
    return (
      value &&
      typeof value === 'object' &&
      (value.full_name || value.first_name || value.last_name)
    );
  }

  // Extract actual record ID from Attio response structure
  extractRecordId(recordIdInput) {
    if (typeof recordIdInput === 'string') {
      return recordIdInput;
    }
    
    // Handle Attio's nested ID structure: { record_id: "actual-uuid" }
    if (recordIdInput && typeof recordIdInput === 'object') {
      return recordIdInput.record_id || recordIdInput.id || recordIdInput;
    }
    
    return recordIdInput;
  }

  // Validate UUID format 
  isValidUUID(uuid) {
    if (!uuid || typeof uuid !== 'string') return false;
    
    // Basic UUID format check (8-4-4-4-12 pattern)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  // ========== LEGACY METHODS FOR COMPATIBILITY ==========
  
  splitReferenceFields(values, attributes) {
    const ready = {};
    const deferred = []; // [{ fieldSlug, target_object, lookup_value, original }]
    for (const [fieldSlug, val] of Object.entries(values || {})) {
      const attr = attributes?.get(fieldSlug);
      const isRef = !!attr && this.isReferenceType(attr.type);

      if (!isRef) {
        ready[fieldSlug] = val;
        continue;
      }

      const stripIfPlaceholder = (v) => {
        if (
          v &&
          typeof v === 'object' &&
          v.target_record_id === 'PLACEHOLDER_UUID'
        ) {
          // keep for later patch:
          deferred.push({
            fieldSlug,
            target_object: v.target_object,
            lookup_value: v.lookup_value,
            original: v
          });
          return null; // do NOT send on create
        }
        return v; // already resolved reference – keep it
      };

      if (Array.isArray(val)) {
        const cleaned = val.map(stripIfPlaceholder).filter(v => v !== null);
        if (cleaned.length) ready[fieldSlug] = cleaned;
      } else {
        const cleaned = stripIfPlaceholder(val);
        if (cleaned !== null) ready[fieldSlug] = cleaned;
      }
    }
    return { ready, deferred };
  }

  queueDeferredRef(deferredQueue, objectSlug, recordId, items) {
    if (!items?.length) return;
    deferredQueue.push({
      objectSlug,
      recordId,
      items
    });
  }

  async flushDeferredReferenceUpdates(deferredQueue, recordCache, maxWaitMs = 10000) {
    if (!deferredQueue.length) return;

    const start = Date.now();
    const pending = [...deferredQueue];
    deferredQueue.length = 0; // clear original queue; we'll requeue if still unresolved

    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    while (pending.length) {
      const task = pending.shift();
      const { objectSlug, recordId, items } = task;

      // attempt to resolve each item from cache or by querying
      const valuesToPatch = {};
      for (const item of items) {
        const { fieldSlug, target_object, lookup_value } = item;
        if (!lookup_value) continue;

        const cacheKey = `${fieldSlug}:${lookup_value}`;
        let resolvedId = recordCache.get(cacheKey);

        if (!resolvedId) {
          // last resort lookup against API
          const lookup = await this.findRecordByLookupValue(target_object, lookup_value);
          if (lookup?.id) {
            resolvedId = lookup.id;
            recordCache.set(cacheKey, resolvedId);
            console.log(`📥 Resolved via lookup ${cacheKey} ➜ ${resolvedId}`);
          }
        }

        if (resolvedId) {
          valuesToPatch[fieldSlug] = {
            target_object,
            target_record_id: resolvedId
          };
        } else {
          // not ready yet; requeue if time remains
          if (Date.now() - start < maxWaitMs) {
            pending.push(task);
            await wait(300); // brief backoff
          } else {
            console.warn(`⏳ Gave up resolving ${cacheKey} after ${maxWaitMs}ms`);
          }
          // break to next loop tick to avoid tight spin
          continue;
        }
      }

      // if we got something to patch, do it
      if (Object.keys(valuesToPatch).length) {
        const endpoint = this.getUpdateEndpointFor(objectSlug, recordId); // (CHANGED)
        const payload = this.stripLookupValues({
          data: { values: valuesToPatch }
        });

        console.log(`🧷 Patching refs on ${objectSlug}:${recordId} with`, payload);
        try {
          await this.apiCall(endpoint, 'PATCH', payload);
        } catch (e) {
          console.error(`❌ Failed to patch ${objectSlug}:${recordId}`, e);
        }
      }
    }
  }

  isReferenceType(type) {
    return this.isReferenceFieldType(type);
  }

  async findRecordByLookupValue(objectSlug, lookupValue) {
    try {
      const response = await this.apiCall(this.getQueryEndpointFor(objectSlug), 'POST', {
        limit: 100
      });

      const records = response?.data || [];

      for (const record of records) {
        const values = record.values || {};
        for (const key of Object.keys(values)) {
          const value = values[key];

          // Match string fields
          if (typeof value === 'string' && value.toLowerCase().includes(String(lookupValue).toLowerCase())) {
            return { id: record.id?.record_id || record.id, values };
          }

          // Match array of strings
          if (Array.isArray(value)) {
            if (value.some(v => typeof v === 'string' && v.toLowerCase().includes(String(lookupValue).toLowerCase()))) {
              return { id: record.id?.record_id || record.id, values };
            }
          }

          // Match nested object fields
          if (typeof value === 'object' && value !== null) {
            for (const [, val] of Object.entries(value)) {
              if (typeof val === 'string' && val.toLowerCase().includes(String(lookupValue).toLowerCase())) {
                return { id: record.id?.record_id || record.id, values };
              }
            }
          }
        }
      }

      return null;
    } catch (err) {
      console.error(`❌ Error in findRecordByLookupValue: ${err.message}`);
      return null;
    }
  }

  guessTargetObject(attrType) {
    return this.getTargetObjectFromType(attrType, {});
  }

  // ========== UTILITY METHODS ==========
  sortActionsByDependencies(actions) {
    return actions.sort((a, b) => (a.priority || 999) - (b.priority || 999));
  }

  async checkExistingRecord(action) {
    try {
       const objectSlug = action.object_slug;
        const queryEndpoint = this.getQueryEndpointFor(objectSlug);
        const isV2 = this.isV2Resource(objectSlug);

    // v2 => GET /<slug>; objects => POST /objects/<slug>/records/query
        const response = await this.apiCall(
          queryEndpoint,
          isV2 ? 'GET' : 'POST',
          isV2 ? null : { "limit": 100 }
        );

    const records = response?.data || [];
      
      const matches = records.filter(record => {
        const values = record.values || {};
        
        for (const [searchKey, searchValue] of Object.entries(action.search_criteria || {})) {
          const recordValue = values[searchKey];
          if (recordValue && this.valueMatches(recordValue, searchValue)) {
            return true;
          }
        }
        return false;
      });
      
      return {
        found: matches.length > 0,
        matches: matches.slice(0, 3),
        count: matches.length,
        record_ids: matches.map(m => m.id?.record_id || m.id).filter(Boolean)
      };
      
    } catch (error) {
      console.error('Error checking existing records:', error);
      return { found: false, matches: [], count: 0, error: error.message };
    }
  }

  async apiCall(endpoint, method = 'GET', body = null) {
    // Check cache first for GET requests
    if (method === 'GET' || (method === 'POST' && endpoint.includes('/query'))) {
      const cacheKey = `${method}:${endpoint}:${JSON.stringify(body)}`;
      if (this.apiResponseCache.has(cacheKey)) {
        const cached = this.apiResponseCache.get(cacheKey);
        if (Date.now() - cached.timestamp < this.cacheConfig.apiResponseTTL) {
          console.log(`🎯 Using cached API response for ${endpoint}`);
          return cached.data;
        }
      }
    }
    
    await this.rateLimiter.wait();
    
    const url = `${this.baseUrl}${endpoint}`;
    const options = {
      method,
      headers: this.headers,
      ...(body && { body: JSON.stringify(body) })
    };
    
    console.log(`🌐 ${method} ${endpoint}`, body ? `with payload: ${JSON.stringify(body, null, 2)}` : '');
    
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      console.log('⏳ Rate limited, waiting...');
      await new Promise(resolve => setTimeout(resolve, 60000));
      return this.apiCall(endpoint, method, body);
    }
    
    const responseText = await response.text();
    
    if (!response.ok) {
      console.error(`❌ API Error (${response.status}):`, responseText);
      throw new Error(`API Error (${response.status}): ${responseText}`);
    }
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      result = { raw: responseText };
    }
    
    // Cache successful responses for GET/query requests
    if (result && (method === 'GET' || (method === 'POST' && endpoint.includes('/query')))) {
      const cacheKey = `${method}:${endpoint}:${JSON.stringify(body)}`;
      this.apiResponseCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      // Clean up cache if it gets too big
      if (this.apiResponseCache.size > this.cacheConfig.maxCacheSize) {
        this.cleanupCache(this.apiResponseCache);
      }
    }
    
    return result;
  }

  hashString(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  cleanupCache(cache) {
    // Remove oldest 20% of cache entries
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = Math.floor(entries.length * 0.2);
    
    for (let i = 0; i < toRemove; i++) {
      cache.delete(entries[i][0]);
    }
    
    console.log(`🧹 Cleaned up cache: removed ${toRemove} old entries`);
  }

  async callGroq(prompt, options = {}) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || 'llama-3.3-70b-versatile',
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert CRM automation system. Always respond with valid JSON.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: options.temperature || 0.1,
        max_tokens: 2000,
        response_format: options.response_format
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content;
  }

  generateSummary(results) {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const actions = results.map(r => `${r.action} on ${r.object}`).join(', ');
    
    return {
      total: results.length,
      successful,
      failed,
      actions,
      message: `Processed ${successful}/${results.length} actions successfully`
    };
  }

  getSchemaInfo() {
    return {
      objects: Array.from(this.crmSchema.objects.values()),
      totalAttributes: Array.from(this.crmSchema.attributes.values())
        .reduce((sum, attrs) => sum + attrs.size, 0),
      initialized: this.crmSchema.initialized
    };
  }

  async testConnection() {
    try {
      const response = await this.apiCall('/objects');
      return { 
        success: true, 
        message: 'Connection successful',
        objectCount: response?.data?.length || 0
      };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
}

// ========== RATE LIMITER ==========
class RateLimiter {
  constructor(requestsPerMinute = 50) {
    this.requestsPerMinute = requestsPerMinute;
    this.requests = [];
  }

  async wait() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < 60000);
    
    if (this.requests.length >= this.requestsPerMinute) {
      const waitTime = 60000 - (now - this.requests[0]) + 100;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.requests.push(now);
  }
}

export { AttioCRMProcessor };

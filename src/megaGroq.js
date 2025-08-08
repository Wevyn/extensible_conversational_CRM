// Enhanced Groq CRM Integration with Proper Attio API Handling
import { AttioCRMProcessor } from './CRMConnector.js';
import openApiSpec from './attio_cleaned_no_country_code.json';

class RateLimitedGroqCRM {
  constructor(attioProcessor) {
    this.attio = attioProcessor;
    this.recordCache = new Map();
    this.schemaCache = new Map();
    
    // Rate limiting configuration
    this.rateLimiter = new GroqRateLimiter({
      requestsPerMinute: 30,
      requestsPerHour: 100,
      retryDelay: 2000,
      maxRetries: 3
    });
  }

  // Main processing with fallback strategy
  async processUserInput(userInput, options = {}) {
    try {
      console.log('🚀 Starting Groq CRM processing...');
      
      // Try Groq first with rate limiting
      const groqResult = await this.tryGroqProcessing(userInput, options);
      if (groqResult.success) {
        return groqResult;
      }
      
      // If Groq fails, fallback to template-based processing
      console.log('⚠️ Groq failed, falling back to template processing...');
      return await this.fallbackToTemplates(userInput);
      
    } catch (error) {
      console.error('❌ All processing methods failed:', error);
      return {
        success: false,
        error: error.message,
        fallback_attempted: true
      };
    }
  }

  async tryGroqProcessing(userInput, options = {}) {
    try {
      await this.rateLimiter.waitIfNeeded();
      
      const functions = await this.generateCRMFunctions();
      const systemPrompt = await this.generateSystemPrompt();
      
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userInput }
      ];

      return await this.executeConversationWithRetry(messages, functions, options);
      
    } catch (error) {
      if (error.message.includes('429') || error.message.includes('rate limit')) {
        console.warn('🚦 Rate limit hit, will retry after delay...');
        await this.rateLimiter.handleRateLimit();
        throw new Error('RATE_LIMITED');
      }
      throw error;
    }
  }

  async executeConversationWithRetry(messages, functions, options = {}) {
    const maxIterations = Math.min(options.maxIterations || 5, 5);
    const results = [];
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      console.log(`🔄 Conversation iteration ${iteration}`);

      try {
        await this.rateLimiter.waitIfNeeded();
        
        const response = await this.callGroqWithRetry(messages, functions);
        const choice = response.choices[0];

        if (choice.finish_reason === 'function_call') {
          const functionCall = choice.message.function_call;
          console.log(`🔧 Executing function: ${functionCall.name}`);
          
          const functionResult = await this.executeCRMFunctionOptimized(functionCall);
          results.push(functionResult);

          messages.push(choice.message);
          messages.push({
            role: "function",
            name: functionCall.name,
            content: JSON.stringify(functionResult)
          });

          continue;

        } else if (choice.finish_reason === 'stop') {
          return {
            success: true,
            message: choice.message.content,
            function_results: results,
            total_iterations: iteration,
            method: 'groq'
          };
        }
      } catch (error) {
        if (error.message === 'RATE_LIMITED') {
          console.log('🚦 Rate limited during conversation, falling back...');
          throw error;
        }
        console.error(`❌ Error in iteration ${iteration}:`, error.message);
        break;
      }
    }

    return {
      success: results.length > 0,
      message: `Completed ${iteration} iterations with ${results.length} function calls`,
      function_results: results,
      partial: true,
      method: 'groq_partial'
    };
  }

  async callGroqWithRetry(messages, functions) {
    return await this.rateLimiter.executeWithRetry(async () => {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.attio.groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: messages,
          functions: functions,
          function_call: "auto",
          temperature: 0.1,
          max_tokens: 2000
        })
      });

      if (response.status === 429) {
        const rateLimitError = new Error('Rate limit exceeded');
        rateLimitError.status = 429;
        throw rateLimitError;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error (${response.status}): ${errorText}`);
      }

      return await response.json();
    });
  }

  async executeCRMFunctionOptimized(functionCall) {
    const { name, arguments: args } = functionCall;
    const params = typeof args === 'string' ? JSON.parse(args) : args;

    console.log(`🛠️ Executing CRM function: ${name}`, params);

    switch (name) {
      case 'search_records':
        return await this.searchRecordsOptimized(params);
      
      case 'create_company_record':
        return await this.createCompanyRecord(params);
      
      case 'create_person_record':
        return await this.createPersonRecord(params);
        
      case 'get_record_reference':
        return await this.getRecordReference(params);
      
      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }

  async searchRecordsOptimized({ object_type, search_criteria }) {
    const cacheKey = `search_${object_type}_${JSON.stringify(search_criteria)}`;
    
    if (this.recordCache.has(cacheKey)) {
      console.log(`📦 Using cached search result for ${cacheKey}`);
      return this.recordCache.get(cacheKey);
    }

    try {
      const foundRecords = [];
      
      // Get the object info to build the correct endpoint
      const objectInfo = this.attio.crmSchema.objects.get(object_type);
      if (!objectInfo) {
        throw new Error(`Unknown object type: ${object_type}`);
      }

      // Use the proper Attio query endpoint
      const response = await this.attio.apiCall(`/objects/${objectInfo.id}/records/query`, 'POST', {
        limit: 50
      });
      
      const records = response?.data || [];
      
      for (const record of records) {
        const values = record.values || {};
        
        // Check if this record matches our search criteria
        let matches = false;
        for (const [field, searchValue] of Object.entries(search_criteria)) {
          if (this.attio.valueMatches(values[field], searchValue)) {
            matches = true;
            foundRecords.push({
              id: record.id?.record_id || record.id,
              values: values,
              matched_field: field,
              matched_value: searchValue
            });
            
            // Cache this record for future reference resolution
            this.cacheRecordForReferences(object_type, values, record.id?.record_id || record.id);
            break;
          }
        }
      }

      const result = {
        success: true,
        found: foundRecords.length > 0,
        records: foundRecords,
        count: foundRecords.length,
        object_type
      };

      this.recordCache.set(cacheKey, result);
      return result;

    } catch (error) {
      return {
        success: false,
        error: error.message,
        object_type,
        search_criteria
      };
    }
  }

  async createCompanyRecord({ company_data }) {
    try {
      console.log('🏢 Creating company record:', company_data);

      // Get companies object info
      const companiesObj = this.attio.crmSchema.objects.get('companies');
      if (!companiesObj) {
        throw new Error('Companies object not found in schema');
      }

      // Build proper Attio payload structure
      const attioPayload = {
        data: {
          values: this.buildAttioValues('companies', company_data)
        }
      };

      console.log('🏢 Attio company payload:', JSON.stringify(attioPayload, null, 2));

      const result = await this.attio.apiCall(`/objects/${companiesObj.id}/records`, 'POST', attioPayload);
      
      if (result?.data?.id) {
        const recordId = result.data.id.record_id || result.data.id;
        
        // Cache this company for future person references
        this.cacheRecordForReferences('companies', company_data, recordId);
        
        return {
          success: true,
          action: 'created',
          object_type: 'companies',
          record_id: recordId,
          data: result.data.values || company_data
        };
      }

      throw new Error('No record ID returned from Attio');

    } catch (error) {
      console.error('❌ Company creation failed:', error);
      return {
        success: false,
        error: error.message,
        object_type: 'companies',
        company_data
      };
    }
  }

  async createPersonRecord({ person_data, company_reference = null }) {
    try {
      console.log('👤 Creating person record:', person_data);

      // Get people object info
      const peopleObj = this.attio.crmSchema.objects.get('people');
      if (!peopleObj) {
        throw new Error('People object not found in schema');
      }

      // Build Attio values
      const attioValues = this.buildAttioValues('people', person_data);

      // If there's a company reference, resolve it
      if (company_reference) {
        const companyId = await this.resolveCompanyReference(company_reference);
        if (companyId) {
          // Add company reference to person record
          attioValues.companies = [{
            target_object: "companies",
            target_record_id: companyId
          }];
        }
      }

      const attioPayload = {
        data: {
          values: attioValues
        }
      };

      console.log('👤 Attio person payload:', JSON.stringify(attioPayload, null, 2));

      const result = await this.attio.apiCall(`/objects/${peopleObj.id}/records`, 'POST', attioPayload);
      
      if (result?.data?.id) {
        const recordId = result.data.id.record_id || result.data.id;
        
        return {
          success: true,
          action: 'created',
          object_type: 'people',
          record_id: recordId,
          data: result.data.values || person_data,
          company_linked: !!company_reference
        };
      }

      throw new Error('No record ID returned from Attio');

    } catch (error) {
      console.error('❌ Person creation failed:', error);
      return {
        success: false,
        error: error.message,
        object_type: 'people',
        person_data
      };
    }
  }

  async resolveCompanyReference(companyRef) {
    // Try to find company ID in cache first
    const cacheKey = `company_name:${companyRef.name}`;
    let companyId = this.recordCache.get(cacheKey);

    if (companyId) {
      console.log(`📦 Found cached company ID for "${companyRef.name}": ${companyId}`);
      return companyId;
    }

    // Search for the company in Attio
    const searchResult = await this.searchRecordsOptimized({
      object_type: 'companies',
      search_criteria: { name: companyRef.name }
    });

    if (searchResult.success && searchResult.records.length > 0) {
      companyId = searchResult.records[0].id;
      console.log(`🔍 Found company via search: "${companyRef.name}" -> ${companyId}`);
      return companyId;
    }

    console.warn(`⚠️ Could not resolve company reference: ${companyRef.name}`);
    return null;
  }

  async getRecordReference({ object_type, search_value, search_field = 'name' }) {
    try {
      const searchResult = await this.searchRecordsOptimized({
        object_type,
        search_criteria: { [search_field]: search_value }
      });

      if (searchResult.success && searchResult.records.length > 0) {
        return {
          success: true,
          record_id: searchResult.records[0].id,
          object_type,
          search_value
        };
      }

      return {
        success: false,
        message: `No ${object_type} found with ${search_field}: ${search_value}`,
        object_type,
        search_value
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        object_type,
        search_value
      };
    }
  }

  buildAttioValues(objectType, inputData) {
    const attributes = this.attio.crmSchema.attributes.get(objectType);
    const attioValues = {};

    for (const [key, value] of Object.entries(inputData)) {
      const attr = attributes?.get(key);
      
      if (!attr) {
        console.warn(`⚠️ Unknown attribute ${key} for ${objectType}`);
        continue;
      }

      // Format value according to Attio's expected structure
      switch (attr.type) {
        case 'person_name':
          if (typeof value === 'string') {
            const parts = value.split(' ');
            attioValues[key] = {
              first_name: parts[0] || '',
              last_name: parts.slice(1).join(' ') || '',
              full_name: value
            };
          } else if (typeof value === 'object') {
            attioValues[key] = value;
          }
          break;

        case 'email_address':
          if (typeof value === 'string') {
            attioValues[key] = attr.multivalue ? [value] : value;
          } else {
            attioValues[key] = value;
          }
          break;

        case 'phone_number':
          if (typeof value === 'string') {
            const phoneObj = {
              original_phone_number: value,
              country_code: "US" // Default to US, could be smarter
            };
            attioValues[key] = attr.multivalue ? [phoneObj] : phoneObj;
          } else {
            attioValues[key] = value;
          }
          break;

        case 'text':
        case 'textarea':
          attioValues[key] = attr.multivalue && !Array.isArray(value) ? [value] : value;
          break;

        default:
          attioValues[key] = value;
          break;
      }
    }

    return attioValues;
  }

  cacheRecordForReferences(objectType, data, recordId) {
    // Cache by name for easy lookup
    if (data.name) {
      const nameKey = `${objectType}_name:${data.name}`;
      this.recordCache.set(nameKey, recordId);
    }

    // Cache by email for people
    if (objectType === 'people' && data.primary_email_address) {
      const emailKey = `people_email:${data.primary_email_address}`;
      this.recordCache.set(emailKey, recordId);
    }

    console.log(`📌 Cached ${objectType} record: ${recordId}`);
  }

  async generateCRMFunctions() {
    await this.attio.initializeSchema();
    
    return [
      {
        name: "search_records",
        description: "Search for existing records in the CRM",
        parameters: {
          type: "object",
          properties: {
            object_type: {
              type: "string",
              enum: ["companies", "people"],
              description: "Type of record to search for"
            },
            search_criteria: {
              type: "object",
              description: "Fields and values to search for",
              properties: {
                name: { type: "string" },
                primary_email_address: { type: "string" },
                domain: { type: "string" }
              }
            }
          },
          required: ["object_type", "search_criteria"]
        }
      },
      {
        name: "create_company_record",
        description: "Create a new company record. Always create companies BEFORE people who work there.",
        parameters: {
          type: "object",
          properties: {
            company_data: {
              type: "object",
              properties: {
                name: { type: "string", description: "Company name" },
                domain: { type: "string", description: "Company website domain" },
                description: { type: "string", description: "Company description" },
                industry: { type: "string", description: "Company industry" }
              },
              required: ["name"]
            }
          },
          required: ["company_data"]
        }
      },
      {
        name: "create_person_record",
        description: "Create a new person record. If they work at a company, reference it.",
        parameters: {
          type: "object",
          properties: {
            person_data: {
              type: "object",
              properties: {
                name: { type: "string", description: "Full name of the person" },
                primary_email_address: { type: "string", description: "Primary email" },
                phone_numbers: { type: "string", description: "Phone number" },
                job_title: { type: "string", description: "Job title" }
              },
              required: ["name"]
            },
            company_reference: {
              type: "object",
              properties: {
                name: { type: "string", description: "Name of the company this person works at" }
              },
              description: "Reference to the company this person works at (if any)"
            }
          },
          required: ["person_data"]
        }
      },
      {
        name: "get_record_reference",
        description: "Get the ID of a record for referencing in other records",
        parameters: {
          type: "object",
          properties: {
            object_type: {
              type: "string",
              enum: ["companies", "people"]
            },
            search_value: { type: "string" },
            search_field: { type: "string", default: "name" }
          },
          required: ["object_type", "search_value"]
        }
      }
    ];
  }

  async generateSystemPrompt() {
    return `You are an intelligent CRM assistant that processes business conversations and creates/updates records in Attio CRM.

WORKFLOW (CRITICAL - Follow this order):
1. ALWAYS search for existing records first to avoid duplicates
2. Create companies BEFORE creating people who work there
3. When creating people, reference their company if mentioned
4. Keep function calls minimal and efficient

IMPORTANT RULES:
- Always check if companies/people already exist before creating
- Companies must be created before people who work there
- Use the person's company_reference parameter to link them to their company
- Extract contact info accurately (emails, phone numbers, names)
- Infer job titles, company names, and relationships from context
- Be efficient - only create what's actually mentioned in the conversation

Respond with function calls to process the business conversation effectively.`;
  }

  // Fallback and utility methods remain the same...
  async fallbackToTemplates(userInput) {
    try {
      console.log('🔄 Using template-based processing as fallback...');
      
      const templateResult = await this.attio.processText(userInput);
      
      return {
        success: templateResult.success,
        message: `Processed using template method: ${templateResult.summary?.message || 'Completed'}`,
        function_results: this.convertTemplateResults(templateResult.results || []),
        method: 'templates',
        fallback: true
      };
      
    } catch (error) {
      throw new Error(`Both Groq and template processing failed: ${error.message}`);
    }
  }

  convertTemplateResults(templateResults) {
    return templateResults.map(result => ({
      success: result.success,
      action: result.action,
      object_type: result.object,
      message: result.reasoning || 'Template processing completed',
      method: 'template'
    }));
  }
}

// Rate Limiter Class (unchanged)
class GroqRateLimiter {
  constructor(options = {}) {
    this.requestsPerMinute = options.requestsPerMinute || 30;
    this.requestsPerHour = options.requestsPerHour || 100;
    this.retryDelay = options.retryDelay || 2000;
    this.maxRetries = options.maxRetries || 3;
    
    this.minuteRequests = [];
    this.hourRequests = [];
    this.lastRateLimit = null;
  }

  async waitIfNeeded() {
    const now = Date.now();
    
    this.minuteRequests = this.minuteRequests.filter(time => now - time < 60000);
    this.hourRequests = this.hourRequests.filter(time => now - time < 3600000);
    
    if (this.minuteRequests.length >= this.requestsPerMinute) {
      const waitTime = 60000 - (now - this.minuteRequests[0]) + 100;
      console.log(`⏳ Rate limit: waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    if (this.hourRequests.length >= this.requestsPerHour) {
      const waitTime = 3600000 - (now - this.hourRequests[0]) + 100;
      console.log(`⏳ Hourly limit: waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    if (this.lastRateLimit && (now - this.lastRateLimit) < this.retryDelay) {
      const extraWait = this.retryDelay - (now - this.lastRateLimit);
      console.log(`⏳ Recent rate limit: waiting extra ${extraWait}ms...`);
      await new Promise(resolve => setTimeout(resolve, extraWait));
    }
  }

  recordRequest() {
    const now = Date.now();
    this.minuteRequests.push(now);
    this.hourRequests.push(now);
  }

  async handleRateLimit() {
    this.lastRateLimit = Date.now();
    console.log(`🚦 Rate limit detected, waiting ${this.retryDelay}ms...`);
    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
  }

  async executeWithRetry(fn, retryCount = 0) {
    try {
      await this.waitIfNeeded();
      this.recordRequest();
      
      return await fn();
      
    } catch (error) {
      if ((error.status === 429 || error.message.includes('rate limit')) && retryCount < this.maxRetries) {
        await this.handleRateLimit();
        return this.executeWithRetry(fn, retryCount + 1);
      }
      throw error;
    }
  }
}

// Updated Enhanced Processor
class EnhancedAttioCRMProcessor extends AttioCRMProcessor {
  constructor(attioApiKey, groqApiKey) {
    super(attioApiKey, groqApiKey, openApiSpec);
    this.groqCRM = new RateLimitedGroqCRM(this);
  }

  async processWithGroq(userInput, options = {}) {
    return await this.groqCRM.processUserInput(userInput, options);
  }

  async processIntelligently(userInput, options = {}) {
    return await this.processWithGroq(userInput, options);
  }
}

export { EnhancedAttioCRMProcessor, RateLimitedGroqCRM };
// advanced-parser.js - Enhanced AI parsing for deal intelligence

import { isTeamOrRole, analyzeDealLanguage, mapToValidStage } from './advanced-attio.js';


export async function sendToAdvancedDeepSeek(text, conversationContext = {}) {
  const dealAnalysis = analyzeDealLanguage(text);
  
  const prompt = `
You are an advanced Attio CRM intelligence assistant. Extract structured data from sales conversations with sophisticated deal and relationship insights.

CONTEXT:
- Current conversation deals with: ${conversationContext.activeDeals || 'unknown deals'}
- Known contacts: ${conversationContext.knownContacts || 'unknown contacts'}  
- Company focus: ${conversationContext.company || 'unknown company'}

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
6. 📋 Create follow-up tasks for implied next steps
7. 💼 Support employee-employee CRM with internal stakeholder tracking

IMPORTANT: Use these valid deal stages only:
- "Lead" (for initial contact, first calls, prospects)
- "In Progress" (for discovery, demos, proposals, negotiations)  
- "Won" (for signed deals)
- "Lost" (for lost deals)


RESPONSE FORMAT - Return valid JSON array with these object types:

PERSON OBJECT:
{
  "type": "person",
  "name": "Full Name",
  "first_name": "First",
  "last_name": "Last",
  "email": "email@domain.com",
  "role": "CTO/CMO/etc",
  "company": "Company Name",
  "sentiment": "positive/negative/neutral",
  "notes": "Context about this person's stance/concerns"
}

COMPANY OBJECT:
{
  "type": "company", 
  "name": "Company Name",
  "relationship_health": "high/medium/low",
  "expansion_opportunity": "Description of expansion potential",
  "churn_risk": "low/medium/high"
}

DEAL OBJECT:
{
  "type": "deal",
  "name": "Deal Name",
  "company": "Company Name", 
  "value": 150000,
  "close_date": "Q1 2026",
  "stage": "Proposal",
  "probability": 75,
  "competitors": ["Competitor 1", "Competitor 2"],
  "pain_points": ["Integration concerns", "Budget constraints"],
  "decision_maker": "Person Name",
  "buying_signals": ["budget approved", "timeline established"],
  "risk_signals": ["legal reviewing", "other priorities"]
}

TASK OBJECT:
{
  "type": "task",
  "name": "Task Name",
  "description": "Detailed task description",
  "due_date": "2025-08-06T15:00:00Z",
  "priority": "high/medium/low",
  "link_to_person_name": "Person Name",
  "link_to_company": "Company Name", 
  "link_to_deal": "Deal Name",
  "task_type": "follow_up/demo/proposal/contract_review"
}

RELATIONSHIP OBJECT:
{
  "type": "relationship",
  "company": "Company Name",
  "contact_updates": [
    {
      "name": "Person Name",
      "sentiment": "positive/negative", 
      "context": "Specific feedback or concerns"
    }
  ],
  "account_health": {
    "overall_score": "high/medium/low",
    "expansion_notes": "Technical team interested in API features",
    "risk_level": "Budget concerns from procurement"
  }
}

INTELLIGENCE EXTRACTION EXAMPLES:

INPUT: "So if I understand correctly, you've got budget approved for Q1 of next year, somewhere in the $150K range, but the real decision maker here is going to be your CTO because of the ERP integration concerns..."

OUTPUT:
[
  {
    "type": "deal",
    "name": "Q1 2026 Deal",
    "value": 150000,
    "close_date": "Q1 2026", 
    "stage": "Proposal",
    "probability": 80,
    "pain_points": ["ERP integration concerns"],
    "decision_maker": "CTO",
    "buying_signals": ["budget approved"]
  },
  {
    "type": "person",
    "name": "CTO",
    "first_name": "CTO",
    "last_name": "",
    "role": "CTO", 
    "sentiment": "neutral",
    "notes": "Key decision maker, concerned about ERP integration"
  },
  {
    "type": "task",
    "name": "Technical Demo for CTO",
    "description": "Schedule technical demonstration focusing on ERP integration capabilities",
    "due_date": "2025-08-14T15:00:00Z",
    "priority": "high",
    "link_to_person_name": "CTO",
    "link_to_deal": "Q1 2026 Deal",
    "task_type": "demo"
  }
]

INPUT: "Things are going really well with the engineering team - they love the new API. But I'm a bit worried about the marketing team adoption. Lisa mentioned budget concerns for next year, and honestly, I think Dave from procurement is still skeptical about the ROI since that Q3 incident."

OUTPUT:
[
  {
    "type": "company",
    "name": "Current Client",
    "relationship_health": "medium",
    "expansion_opportunity": "Engineering team loves API - potential for expanded features",
    "churn_risk": "medium"
  },
  {
    "type": "person", 
    "name": "Engineering Team",
    "first_name": "Engineering",
    "last_name": "Team",
    "role": "Engineering",
    "sentiment": "positive",
    "notes": "Loves the new API functionality"
  },
  {
    "type": "person",
    "name": "Lisa",
    "first_name": "Lisa",
    "last_name": "",
    "role": "Marketing",
    "sentiment": "negative", 
    "notes": "Has budget concerns for next year"
  },
  {
    "type": "person",
    "name": "Dave",
    "first_name": "Dave",
    "last_name": "",
    "role": "Procurement",
    "sentiment": "negative",
    "notes": "Skeptical about ROI since Q3 incident"
  },
  {
    "type": "relationship",
    "company": "Current Client",
    "contact_updates": [
      {
        "name": "Engineering Team",
        "sentiment": "positive",
        "context": "Loves new API"
      },
      {
        "name": "Lisa", 
        "sentiment": "negative",
        "context": "Budget concerns for next year"
      },
      {
        "name": "Dave",
        "sentiment": "negative", 
        "context": "Skeptical about ROI since Q3 incident"
      }
    ],
    "account_health": {
      "overall_score": "medium",
      "expansion_notes": "API adoption going well with engineering",
      "risk_level": "Budget and ROI concerns from marketing and procurement"
    }
  },
  {
    "type": "task",
    "name": "Address procurement ROI concerns with Dave",
    "description": "Schedule meeting with Dave to address ROI skepticism stemming from Q3 incident",
    "due_date": "2025-08-06T15:00:00Z",
    "priority": "high",
    "link_to_person_name": "Dave", 
    "link_to_company": "Current Client",
    "task_type": "follow_up"
  },
  {
    "type": "task",
    "name": "Explore expanded API features with engineering",
    "description": "Follow up with engineering team on additional API features they'd find valuable",
    "due_date": "2025-08-08T15:00:00Z", 
    "priority": "medium",
    "link_to_person_name": "Engineering Team",
    "link_to_company": "Current Client",
    "task_type": "follow_up"
  }
]

CONVERSATION TO ANALYZE:
"""
${text}
"""

DETECTED SIGNALS FROM PRE-ANALYSIS:
- Stage: ${dealAnalysis.stage}
- Sentiment: ${dealAnalysis.sentiment} 
- Buying Signals: ${dealAnalysis.buying_signals.join(', ')}
- Risk Signals: ${dealAnalysis.risk_signals.join(', ')}
- Value Indicators: ${dealAnalysis.value_indicators.join(', ')}

Return ONLY the JSON array with valid stage names:`;

  const systemMessage = 'You are an advanced CRM intelligence assistant. Extract comprehensive deal, relationship, and business intelligence from sales conversations. Always return valid JSON with detailed context and sentiment analysis. DO NOT create person objects for teams, roles, or departments - only for named individuals. Use only the valid stage names provided.';

  // Try Groq first (faster)
  try {
    console.log('🚀 Attempting Groq API call...');
    
    const groqRequestBody = {
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: systemMessage
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 4000
    };
    
    console.log('📤 Groq Request Body:', JSON.stringify(groqRequestBody, null, 2));
    
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer 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',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(groqRequestBody)
    });

    console.log('📥 Groq Response Status:', groqResponse.status);
    console.log('📥 Groq Response Headers:', Object.fromEntries(groqResponse.headers.entries()));

    // Check if Groq succeeded
    if (groqResponse.ok) {
      const groqData = await groqResponse.json();
      console.log('📊 Groq Response Data:', groqData);
      
      const raw = groqData.choices?.[0]?.message?.content;
      
      if (raw) {
        console.log('✅ Groq API successful');
        console.log('🧠 Groq AI Response:', raw);
        
        // Process the response with the same logic
        const processed = await processAIResponse(raw, dealAnalysis);
        return processed;
      } else {
        console.log('⚠️ Groq returned empty response, falling back to OpenRouter...');
        console.log('📊 Full Groq Data:', groqData);
      }
    } else {
      // Get detailed error information
      const errorText = await groqResponse.text();
      console.log('❌ Groq Error Response Text:', errorText);
      
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
        console.log('❌ Groq Error Data:', errorData);
      } catch (parseErr) {
        console.log('❌ Could not parse Groq error as JSON');
      }
      
      if (groqResponse.status === 429 || errorData.error?.type === 'rate_limit_exceeded') {
        console.log('⚠️ Groq rate limit hit, falling back to OpenRouter...');
      } else if (groqResponse.status === 400) {
        console.log('⚠️ Groq bad request (400) - possibly invalid model or request format, falling back to OpenRouter...');
        console.log('🔍 Error details:', errorData.error?.message || 'No error message provided');
      } else if (groqResponse.status === 401) {
        console.log('⚠️ Groq authentication error (401) - check API key, falling back to OpenRouter...');
      } else {
        console.log(`⚠️ Groq API error (${groqResponse.status}), falling back to OpenRouter...`);
        console.log('🔍 Error details:', errorData.error?.message || errorText);
      }
    }
  } catch (groqError) {
    console.log('⚠️ Groq API network/fetch error, falling back to OpenRouter:');
    console.log('🔍 Error name:', groqError.name);
    console.log('🔍 Error message:', groqError.message);
    console.log('🔍 Error stack:', groqError.stack);
  }

  // Fallback to OpenRouter
  try {
    console.log('🔄 Using OpenRouter fallback...');
    
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer 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',
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Advanced Attio CRM Intelligence'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-r1:free',
        messages: [
          {
            role: 'system',
            content: systemMessage
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      })
    });

    const openRouterData = await openRouterResponse.json();
    const raw = openRouterData.choices?.[0]?.message?.content;
    
    if (!raw) {
      console.warn('❌ No response from OpenRouter fallback');
      return [];
    }

    console.log('✅ OpenRouter fallback successful');
    console.log('🧠 OpenRouter AI Response:', raw);

    // Process the response with the same logic
    const processed = await processAIResponse(raw, dealAnalysis);
    return processed;

  } catch (openRouterError) {
    console.error('❌ Both Groq and OpenRouter failed:', openRouterError);
    return [];
  }
}

// Extracted response processing logic to avoid duplication
async function processAIResponse(raw, dealAnalysis) {
  try {
    // Enhanced JSON extraction
    let cleaned = raw.replace(/```json|```/g, '').trim();
    
    // Find the JSON array more robustly
    const jsonStart = cleaned.indexOf('[');
    const jsonEnd = cleaned.lastIndexOf(']');
    
    if (jsonStart !== -1 && jsonEnd !== -1) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }

    console.log('🧹 Cleaned AI Response:', cleaned);

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed)) {
      console.warn('❌ AI response is not an array');
      return [];
    }

    // Enhanced validation and enrichment
    const enriched = await Promise.all(parsed.map(async (item) => {
      // Skip team/role items that somehow got through
      if (item.type === 'person' && isTeamOrRole(item.name)) {
        console.log(`🚫 Filtering out team/role person: ${item.name}`);
        return null;
      }

      // Add timestamps
      item.created_at = new Date().toISOString();

      // Enrich deal objects with analysis and stage validation
      if (item.type === 'deal') {
        if (item.stage) {
          const validStage = await mapToValidStage(item.stage);
          if (validStage) {
            // Keep the stage as a string, don't assign the entire object
            item.stage = validStage.title; // Use .title instead of the whole object
            console.log(`✅ Stage validated: "${item.stage}"`);
          } else {
            console.warn(`⚠️ Invalid stage: "${item.stage}" - removing`);
            delete item.stage;
          }
        }

        // Optional: Normalize missing deal owner
        if (!item.owner) {
          item.owner = null; // or leave undefined if Attio accepts null
        }
      }

      return item;
    }));

    return enriched.filter(Boolean);
  } catch (err) {
    console.error('❌ Error parsing AI response:', err);
    return [];
  }
}

function parseSmartDate(dateStr) {
  try {
    const lower = dateStr.toLowerCase();
    const currentYear = new Date().getFullYear();
    
    if (lower.includes('q1')) {
      const year = lower.includes('next year') ? currentYear + 1 : currentYear;
      return new Date(year, 2, 31).toISOString(); // End of Q1
    }
    if (lower.includes('q2')) {
      const year = lower.includes('next year') ? currentYear + 1 : currentYear;
      return new Date(year, 5, 30).toISOString(); // End of Q2  
    }
    if (lower.includes('q3')) {
      const year = lower.includes('next year') ? currentYear + 1 : currentYear;
      return new Date(year, 8, 30).toISOString(); // End of Q3
    }
    if (lower.includes('q4')) {
      const year = lower.includes('next year') ? currentYear + 1 : currentYear;
      return new Date(year, 11, 31).toISOString(); // End of Q4
    }
    
    // Try direct parsing
    return new Date(dateStr).toISOString();
  } catch {
    // Default to end of next quarter
    const nextQuarter = new Date();
    nextQuarter.setMonth(nextQuarter.getMonth() + 3);
    return nextQuarter.toISOString();
  }
}

function getSmartDueDate(taskType) {
  const now = new Date();
  
  switch (taskType) {
    case 'follow_up':
      now.setDate(now.getDate() + 2); // 2 days
      break;
    case 'demo':
      now.setDate(now.getDate() + 7); // 1 week
      break;
    case 'proposal':
      now.setDate(now.getDate() + 5); // 5 days
      break;
    case 'contract_review':
      now.setDate(now.getDate() + 14); // 2 weeks
      break;
    default:
      now.setDate(now.getDate() + 3); // 3 days default
  }
  
  return now.toISOString();
}

function inferTaskPriority(task, dealAnalysis) {
  // High priority for deals with strong buying signals
  if (dealAnalysis.buying_signals.length > 0) return 'high';
  
  // High priority for addressing risk signals
  if (dealAnalysis.risk_signals.length > 0) return 'high';
  
  // High priority task types
  if (['demo', 'contract_review'].includes(task.task_type)) return 'high';
  
  // Medium priority for follow-ups
  if (task.task_type === 'follow_up') return 'medium';
  
  return 'medium';
}

// Conversation context management
export class ConversationContext {
  constructor() {
    this.activeDeals = new Set();
    this.knownContacts = new Set();
    this.companies = new Set();
    this.recentContext = [];
  }
  
  updateContext(extractedData) {
    extractedData.forEach(item => {
      if (item.type === 'deal') {
        this.activeDeals.add(item.name);
      }
      if (item.type === 'person') {
        this.knownContacts.add(item.name);
      }
      if (item.type === 'company') {
        this.companies.add(item.name);
      }
    });
    
    // Keep last 10 interactions for context
    this.recentContext.push({
      timestamp: new Date().toISOString(),
      data: extractedData
    });
    
    if (this.recentContext.length > 10) {
      this.recentContext.shift();
    }
  }
  
  getContext() {
    return {
      activeDeals: Array.from(this.activeDeals).join(', '),
      knownContacts: Array.from(this.knownContacts).join(', '),
      companies: Array.from(this.companies).join(', ')
    };
  }
}

export { parseSmartDate, getSmartDueDate, inferTaskPriority };


// openapi_rag.js

import fs from 'fs';
import path from 'path';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory'; // Replace with Chroma, etc.

export class OpenAPIRAG {
  constructor(openApiSpecPath, embeddingApiKey) {
    this.openApiSpecPath = openApiSpecPath;
    this.embeddingApiKey = embeddingApiKey;
    this.vectorStore = null;
    this.embeddings = new OpenAIEmbeddings({ openAIApiKey: embeddingApiKey });
  }

  async loadAndIndexSpec() {
    const raw = fs.readFileSync(this.openApiSpecPath, 'utf-8');
    const spec = JSON.parse(raw);
    const chunks = this.splitOpenAPI(spec);
    const documents = chunks.map((chunk, i) => ({
      pageContent: chunk,
      metadata: { id: `chunk-${i}` }
    }));
    this.vectorStore = await MemoryVectorStore.fromDocuments(documents, this.embeddings);
    console.log(`✅ Indexed ${chunks.length} OpenAPI chunks`);
  }

  splitOpenAPI(spec) {
    const chunks = [];

    // Chunk by paths
    for (const [pathKey, pathValue] of Object.entries(spec.paths || {})) {
      for (const [method, operation] of Object.entries(pathValue)) {
        const text = JSON.stringify({
          path: pathKey,
          method,
          operationId: operation.operationId,
          summary: operation.summary,
          request: operation.requestBody,
          responses: operation.responses
        }, null, 2);
        chunks.push(text);
      }
    }

    // Chunk by components/schemas
    for (const [schemaKey, schemaValue] of Object.entries(spec.components?.schemas || {})) {
      const text = JSON.stringify({
        schema: schemaKey,
        definition: schemaValue
      }, null, 2);
      chunks.push(text);
    }

    return chunks;
  }

  async queryRelevantChunks(queryText, k = 3) {
    if (!this.vectorStore) throw new Error('Vector store not initialized');
    const results = await this.vectorStore.similaritySearch(queryText, k);
    return results.map(r => r.pageContent);
  }
}

import { QdrantClient } from "@qdrant/js-client-rest";
import { fileURLToPath } from 'url';
import path from 'path';
import { promises as fs } from 'fs';
import pdf from 'pdf-parse';
import XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync'; // Fixed CSV parse import
import crypto from 'crypto';

// Helper function to sanitize text for search
  function sanitizeText(text) {
    return text
      .replace(/[^\w\s]/g, ' ')  // Replace special chars with space
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim()                    // Trim ends
      .toLowerCase();            // Convert to lowercase
  }

class QdrantService {
  constructor() {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL || "http://localhost:6333",
      timeout: 5000, // 5 seconds timeout
      retries: 3    // Number of retries
    });
    this.embedder = null;
    // this.openai = new OpenAI();
    this.collectionName = 'documents';
    this.initialized = false;
  }

  async initializeEmbedder() {
    if (!this.embedder) {
      // Dynamic import for the transformers package
      const { pipeline } = await import('@xenova/transformers');
      this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
  }

  // Generate UUID from filename to ensure consistency across runs
  generateUUID(filename) {
    return crypto
      .createHash('md5')
      .update(filename)
      .digest('hex');
  }

  async askQuestion_llm_helper(content, prompt) {
    try {
    const url = "http://localhost:11434/api/generate"; // Updated endpoint URL

  
    const data = {
          "model": "llama3.2", // Specify the model
          "prompt": prompt, 
          "format": "json", // Request JSON output
          "stream": false,
        };
      
        const headers = {
          'Content-Type': 'application/json',
          mode: 'no-cors',  // Disables CORS checks
        };
      
          const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data)
          });
      
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
      
          const result = await response.json();
          console.log(result)
      
          // Extract the answer from the response JSON
          return result?.response ?? 'No answer received'; 

    } catch(e) {
      console.log('askQuestion_llm_helper error', e)
    }
  }

  async processNaturalLanguageQuery(query) {
    try {
      const prompt = `You are a precise search query analyzer. Extract important search terms from this query.
        
  Query: "${query}"
  
  Return ONLY a JSON object with this exact structure:
  {
    "terms": ["specific words or phrases to search for"],
    "requireAll": boolean (whether all terms must match)
  }
  
  Extract ONLY explicitly mentioned terms. Do not infer or expand terms.
  Use 'requireAll: true' when terms are connected by 'and', false for 'or'.`;
  
      const result = await this.askQuestion_llm_helper(query, prompt);
      
      let searchCriteria;
      try {
        // If the result is already a JSON object, use it directly
        if (typeof result === 'object') {
          searchCriteria = result;
        } else {
          // If it's a string, try to parse it
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          const jsonStr = jsonMatch ? jsonMatch[0] : result;
          searchCriteria = JSON.parse(jsonStr);
        }
  
        // Handle both old and new response formats
        const terms = [
          ...(searchCriteria.terms || []),
          ...(searchCriteria.names || []),
          ...(searchCriteria.keywords || [])
        ].filter(Boolean);
  
        return {
          terms,
          requireAll: Boolean(searchCriteria.requireAll)
        };
  
      } catch (parseError) {
        console.error('Error parsing LLM response:', parseError);
        // Fallback to using the raw query
        return {
          terms: [query],
          requireAll: false
        };
      }
  
    } catch (error) {
      console.error('Error in query processing:', error);
      return {
        terms: [query],
        requireAll: false
      };
    }
  }

  async getEmbedding(text) {
    try {
      await this.initializeEmbedder();
      
      // Trim and clean the text
      const cleanedText = text.trim().replace(/\s+/g, ' ');
      
      // Get embeddings
      const output = await this.embedder(cleanedText, {
        pooling: 'mean',
        normalize: true
      });
  
      // Convert to array and verify
      const embedding = Array.from(output.data);
      
      if (!embedding || embedding.length !== 384) {
        throw new Error(`Invalid embedding generated: length=${embedding?.length}`);
      }
  
      // Verify the embedding contains valid numbers
      if (!embedding.every(num => typeof num === 'number' && !isNaN(num))) {
        throw new Error('Embedding contains invalid numbers');
      }
  
      console.log('Generated valid embedding:', {
        dimensions: embedding.length,
        hasSomeNonZero: embedding.some(x => x !== 0),
        min: Math.min(...embedding),
        max: Math.max(...embedding)
      });
  
      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }


  async initialize() {
    if (this.initialized) return;
  
    try {
      await this.initializeEmbedder();
      console.log('Embedder initialized');
  
      let retries = 5;
      while (retries > 0) {
        try {
          // Check if collection exists
          const collections = await this.client.getCollections();
          const collectionExists = collections.collections.some(
            collection => collection.name === this.collectionName
          );
  
          if (!collectionExists) {
            console.log('Creating new collection...');
            // Create new collection with optimized settings
            await this.client.createCollection(this.collectionName, {
              vectors: {
                size: 384,
                distance: "Cosine"
              },
              optimizers_config: {
                default_segment_number: 1,
                indexing_threshold: 0,
                memmap_threshold: 0
              },
              on_disk_payload: true
            });
  
            // Verify collection
            const collectionInfo = await this.client.getCollection(this.collectionName);
            console.log('Collection created:', collectionInfo);
          } else {
            console.log('Using existing collection');
            
            // Check if collection is empty
            const collectionInfo = await this.client.getCollection(this.collectionName);
            console.log('Collection info:', collectionInfo);
            
            if (collectionInfo.points_count === 0) {
              console.log('Collection is empty, documents need to be indexed');
            } else {
              console.log(`Collection contains ${collectionInfo.points_count} documents`);
            }
          }
  
          this.initialized = true;
          break;
        } catch (error) {
          console.error('Error during initialization:', error);
          retries--;
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      console.error('Failed to initialize:', error);
      throw error;
    }
  }

  async needsIndexing() {
    try {
      const collectionInfo = await this.client.getCollection(this.collectionName);
      return collectionInfo.points_count === 0;
    } catch (error) {
      console.error('Error checking if indexing needed:', error);
      return true;
    }
  }
  

  // async getEmbedding(text) {
  //   try {
  //     const response = await this.openai.embeddings.create({
  //       model: "text-embedding-ada-002",
  //       input: text
  //     });
  //     return response.data[0].embedding;
  //   } catch (error) {
  //     console.error('Error getting embedding from OpenAI:', error);
  //     throw error;
  //   }
  // }
  async extractPDFContent(dataBuffer) {
    try {
      // Enhanced PDF parsing options
      const options = {
        pagerender: function (pageData) {
          return pageData.getTextContent()
            .then(function (textContent) {
              let lastY, text = '';
              for (let item of textContent.items) {
                if (lastY != item.transform[5] && text) {
                  text += '\n';
                }
                text += item.str;
                lastY = item.transform[5];
              }
              return text;
            });
        },
        max: 0, // no limit on pages
        normalizeWhitespace: true,
        disableCombineTextItems: false
      };

      console.log('Starting PDF extraction...');
      const pdfData = await pdf(dataBuffer, options);
      console.log('PDF extraction completed. Pages:', pdfData.numpages);

      // Clean and normalize the text
      let content = pdfData.text
        .replace(/\s+/g, ' ')
        .replace(/[\r\n]+/g, '\n')
        .trim();

      console.log('Extracted content length:', content.length);
      console.log('Preview of content:', content.substring(0, 100));

      if (!content || content.length === 0) {
        throw new Error('No text content extracted from PDF');
      }

      return {
        text: content,
        metadata: {
          pageCount: pdfData.numpages,
          info: pdfData.info,
          version: pdfData.version
        }
      };
    } catch (error) {
      console.error('Error in PDF extraction:', error);
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  async processFile(filePath, updateStatus) {
    const extension = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    let content = '';
  
    try {
      console.log(`\n=== Processing file: ${fileName} ===`);
      updateStatus && updateStatus(`Processing ${fileName}...`);
  
      // Read file content based on type
      switch (extension) {
        case '.pdf':
          const dataBuffer = await fs.readFile(filePath);
          const pdfContent = await this.extractPDFContent(dataBuffer);
          content = pdfContent.text;
          break;
        case '.csv':
          const csvContent = await fs.readFile(filePath, 'utf-8');
          const records = csvParse(csvContent);
          content = records.map(record => record.join(' ')).join('\n');
          break;
        case '.txt':
        case '.md':
          content = await fs.readFile(filePath, 'utf-8');
          break;
        default:
          throw new Error(`Unsupported file type: ${extension}`);
      }
  
      content = content.trim();
      if (!content) {
        throw new Error('No content extracted from file');
      }
  
      // Log content preview for verification
      console.log(`Content length: ${content.length} characters`);
      console.log('Content preview:', content.substring(0, 100));
  
      // Generate embedding with content verification
      console.log('Generating embedding...');
      const embedding = await this.getEmbedding(content);
      
      // Verify embedding
      const embeddingStats = {
        dimensions: embedding.length,
        hasSomeNonZero: embedding.some(x => x !== 0),
        min: Math.min(...embedding),
        max: Math.max(...embedding),
        mean: embedding.reduce((a, b) => a + b, 0) / embedding.length
      };
      console.log('Embedding stats:', embeddingStats);
  
      // Create point with full content
      const pointId = this.generateUUID(fileName);
      const point = {
        id: pointId,
        vector: embedding,
        payload: {
          path: filePath,
          content: content,
          filename: fileName,
          filetype: extension,
          indexed_at: new Date().toISOString()
        }
      };
  
      // Upsert with wait and verification
      console.log('Upserting point to Qdrant...');
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [point]
      });
  
      // Verify point storage
      const stored = await this.client.retrieve(this.collectionName, {
        ids: [pointId],
        with_payload: true,
        with_vector: true
      });
  
      if (!stored.length || !stored[0].vector || !stored[0].payload?.content) {
        throw new Error('Point verification failed - data not stored properly');
      }
  
      console.log('Storage verification:', {
        hasVector: Boolean(stored[0].vector),
        vectorLength: stored[0].vector.length,
        contentLength: stored[0].payload.content.length,
        payloadSize: JSON.stringify(stored[0].payload).length
      });
  
      return true;
    } catch (error) {
      console.error(`Error processing file ${fileName}:`, error);
      throw error;
    }
  }

  async extractRelevantContext(content, searchTerms) {
    if (!content || !searchTerms || searchTerms.length === 0) {
      return { text: 'No matching content found', highlights: [] };
    }
  
    // Split content into lines and clean them
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    const matches = [];
  
    // Find matches
    lines.forEach((line, index) => {
      const lineLower = line.toLowerCase();
      
      searchTerms.forEach(term => {
        if (!term) return;
        
        // Create variations for doctor names
        const variations = term.toLowerCase().includes('dr.') || 
                          term.toLowerCase().includes('doctor') ?
          [term.toLowerCase()] :
          [term.toLowerCase()];
  
        if (variations.some(v => lineLower.includes(v))) {
          matches.push({
            line: line,
            nextLine: lines[index + 1] || '', // Get next line if it exists
            term: term
          });
        }
      });
    });
  
    if (matches.length === 0) {
      return { text: 'No matching content found', highlights: [] };
    }
  
    // Format matches with highlighting
    const formattedMatches = matches.map(match => {
      let text = match.line;
      // Highlight the term
      const regex = new RegExp(`(${match.term})`, 'gi');
      text = text.replace(regex, '**$1**');
      
      // Add next line if it exists
      if (match.nextLine) {
        text += '\n' + match.nextLine;
      }
      
      return text;
    });
  
    return {
      text: formattedMatches.join('\n[...]\n'),
      highlights: [...new Set(matches.map(m => m.term))]
    };
  }


  async searchSimilarDocuments(query, limit = 5) {
    try {
      const searchCriteria = await this.processNaturalLanguageQuery(query);
      console.log('Search criteria:', searchCriteria);
  
      if (!searchCriteria.terms || searchCriteria.terms.length === 0) {
        console.log('No search terms provided');
        return [];
      }
  
      // Get all points
      const allPoints = await this.client.scroll(this.collectionName, {
        limit: 100,
        with_payload: true,
        with_vector: true,
        offset: 0  // Start from beginning
      }, {});  // Empty filter to get all documents
  
      console.log('Retrieved points:', {
        total: allPoints.points.length,
        hasPayload: allPoints.points.some(p => p.payload),
        sample: allPoints.points[0]?.payload ? 'has payload' : 'no payload'
      });
  
      if (!allPoints.points.length) {
        console.log('No documents found in collection');
        return [];
      }
  
      const results = allPoints.points
        .filter(point => point.payload?.content)
        .map(point => {
          const content = point.payload.content;
          const matches = [];
  
          // Search for each term
          searchCriteria.terms.forEach(term => {
            const regex = new RegExp(term, 'gi');
            let match;
            
            while ((match = regex.exec(content)) !== null) {
              const start = Math.max(0, match.index - 50);
              const end = Math.min(content.length, match.index + term.length + 50);
              matches.push({
                term,
                context: content.substring(start, end),
                position: match.index
              });
            }
          });
  
          // If no matches, return null
          if (matches.length === 0) {
            return null;
          }
  
          // Calculate score based on number of matches and positions
          const score = matches.length / searchCriteria.terms.length;
  
          console.log(`Found ${matches.length} matches in ${point.payload.filename}`);
  
          return {
            filename: path.basename(point.payload.path),
            directory: path.dirname(point.payload.path),
            path: point.payload.path,
            relevantContent: {
              text: matches.map(m => `...${m.context}...`).join('\n'),
              highlights: [...new Set(matches.map(m => m.term))]
            },
            score: score,
            matchPercentage: Math.round(score * 100)
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
  
      console.log(`Returning ${results.length} results`);
      return results;
    } catch (error) {
      console.error('Error in search:', error);
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  async indexDocumentsDirectory(directoryPath, updateStatus) {
    try {
      updateStatus && updateStatus('Reading directory...');
      const files = await fs.readdir(directoryPath);
      const results = {
        success: [],
        failed: []
      };

      for (const file of files) {
        const filePath = path.join(directoryPath, file);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
          try {
            await this.processFile(filePath, updateStatus);
            results.success.push(file);
            updateStatus && updateStatus(`Successfully indexed ${file}`);
          } catch (error) {
            results.failed.push(file);
            updateStatus && updateStatus(`Failed to index ${file}: ${error.message}`);
            console.error(`Failed to index ${file}:`, error);
          }
        }
      }

      return results;
    } catch (error) {
      console.error('Error indexing directory:', error);
      throw error;
    }
  }

  // Utility method to check collection info
  async getCollectionInfo() {
    try {
      return await this.client.getCollection(this.collectionName);
    } catch (error) {
      console.error('Error getting collection info:', error);
      throw error;
    }
  }
}

export default new QdrantService();
import { QdrantClient } from "@qdrant/js-client-rest";
import { fileURLToPath } from 'url';
import path from 'path';
import { promises as fs } from 'fs';
import pdf from 'pdf-parse';
import XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync'; // Fixed CSV parse import
import crypto from 'crypto';

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
      const prompt = `You are a precise search query analyzer. Extract explicitly mentioned names and keywords from this query.
      
  Query: "${query}"
  
  Return ONLY a JSON object with this exact structure:
  {
    "names": ["any person names mentioned"],
    "keywords": ["specific terms or phrases to search for"],
    "requireAll": boolean (whether all terms must match)
  }
  
  Examples:
  
  Query: "find documents about machine learning or AI written by John Smith"
  {
    "names": ["John Smith"],
    "keywords": ["machine learning", "AI"],
    "requireAll": false
  }
  
  Query: "show me emails from Sarah containing project updates and budget"
  {
    "names": ["Sarah"],
    "keywords": ["project updates", "budget"],
    "requireAll": true
  }
  
  Extract ONLY explicitly mentioned terms. Do not infer or expand terms.
  Use 'requireAll: true' when terms are connected by 'and', false for 'or'.
  Default to false if conjunction is not specified.`;
  
      const result = await this.askQuestion_llm_helper(query, prompt);
      
      let searchCriteria;
      try {
        // If the result is already a JSON object, use it directly
        if (typeof result === 'object') {
          searchCriteria = result;
        } else {
          // If it's a string, try to parse it
          // First try to find a JSON object within the string if it exists
          const jsonMatch = result.match(/\{[\s\S]*\}/);
          const jsonStr = jsonMatch ? jsonMatch[0] : result;
          searchCriteria = JSON.parse(jsonStr);
        }
      } catch (parseError) {
        console.error('Error parsing LLM response:', parseError);
        // Fallback to a default structure
        return {
          names: [],
          keywords: [query],
          requireAll: false
        };
      }
  
      // Validate and clean the response
      const cleanedCriteria = {
        names: Array.isArray(searchCriteria.names) ? searchCriteria.names.filter(Boolean) : [],
        keywords: Array.isArray(searchCriteria.keywords) ? searchCriteria.keywords.filter(Boolean) : [],
        requireAll: Boolean(searchCriteria.requireAll)
      };
  
      console.log('Extracted search criteria:', cleanedCriteria);
      return cleanedCriteria;
  
    } catch (error) {
      console.error('Error in natural language query processing:', error);
      // Return a default structure in case of error
      return {
        names: [],
        keywords: [query], // Use the raw query as a keyword
        requireAll: false
      };
    }
  }

  async getEmbedding(text) {
    try {
      await this.initializeEmbedder();

      // Get embeddings
      const output = await this.embedder(text, {
        pooling: 'mean',
        normalize: true
      });

      // Convert to array format that Qdrant expects
      const embedding = Array.from(output.data);
      return embedding;
    } catch (error) {
      console.error('Error getting embedding:', error);
      throw error;
    }
  }


  async initialize() {
    if (this.initialized) return;

    try {
      await this.initializeEmbedder();

      // Add retry logic for Docker startup
      let retries = 5;
      while (retries > 0) {
        try {
          const collections = await this.client.getCollections();
          const collectionExists = collections.collections.some(
            collection => collection.name === this.collectionName
          );

          if (!collectionExists) {
            await this.client.createCollection(this.collectionName, {
              vectors: {
                size: 384, // MiniLM-L6-v2 produces 384-dimensional embeddings
                distance: "Cosine"
              }
            });
            console.log('Created new Qdrant collection');
          } else {
            console.log('Using existing Qdrant collection');
          }

          this.initialized = true;
          break;
        } catch (error) {
          console.log(`Retrying connection to Qdrant (${retries} attempts left)...`);
          retries--;
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      console.error('Failed to initialize Qdrant service:', error);
      throw error;
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
    let metadata = {};

    try {
      updateStatus && updateStatus(`Processing ${fileName}...`);
      console.log(`Processing file: ${fileName}`);

      switch (extension) {
        case '.pdf':
          console.log('Reading PDF file...');
          const dataBuffer = await fs.readFile(filePath);
          console.log('PDF file read, size:', dataBuffer.length);
          const pdfContent = await this.extractPDFContent(dataBuffer);
          content = pdfContent.text;
          metadata = pdfContent.metadata;
          console.log('PDF processing completed');
          break;
        case '.xlsx':
        case '.xls':
          const workbook = XLSX.readFile(filePath);
          content = workbook.SheetNames.map(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            return XLSX.utils.sheet_to_txt(worksheet);
          }).join('\n');
          break;
        case '.csv':
          const csvContent = await fs.readFile(filePath, 'utf-8');
          const records = csvParse(csvContent); // Using the imported csvParse
          content = records.map(record => record.join(' ')).join('\n');
          break;
        case '.txt':
        case '.md':
          content = await fs.readFile(filePath, 'utf-8');
          break;
        default:
          throw new Error(`Unsupported file type: ${extension}`);
      }

      if (!content || content.trim().length === 0) {
        throw new Error('No content could be extracted from file');
      }

      console.log(`Content extracted from ${fileName}, length: ${content.length}`);
      updateStatus && updateStatus(`Generating embedding for ${fileName}...`);

      const embedding = await this.getEmbedding(content);
      const pointId = this.generateUUID(fileName);

      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [{
          id: pointId,
          vector: embedding,
          payload: {
            path: filePath,  // Ensure this is always set
            content: content,
            filename: fileName,
            filetype: extension,
            metadata: metadata,
            indexed_at: new Date().toISOString()
          }
        }]
      });

      return true;
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
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
  
      const searchTerms = [
        ...searchCriteria.doctors,
        ...searchCriteria.medicalTerms,
        ...searchCriteria.conditions
      ];
  
      const queryEmbedding = await this.getEmbedding(searchTerms.join(" "));
  
      const searchResults = await this.client.search(this.collectionName, {
        vector: queryEmbedding,
        limit: limit * 2,
        with_payload: true
      });
  
      // Extract relevant content with context for each result
      const processedResults = await Promise.all(searchResults
        .filter(result => result.score > 0.3)
        .map(async result => {
          if (!result.payload?.content) return null;
          
          const contentLines = result.payload.content.split('\n');
          const matches = [];
          
          // Find line numbers containing matches
          contentLines.forEach((line, lineNum) => {
            const lineLower = line.toLowerCase();
            
            // Check for doctor names
            searchCriteria.doctors.forEach(doctor => {
              const variations = [
                doctor.toLowerCase(),
                `dr. ${doctor.toLowerCase()}`,
                `dr ${doctor.toLowerCase()}`,
                `doctor ${doctor.toLowerCase()}`
              ];
              if (variations.some(v => lineLower.includes(v))) {
                matches.push({ line: lineNum, term: doctor });
              }
            });
            
            // Check for medical terms
            searchCriteria.medicalTerms.forEach(term => {
              if (lineLower.includes(term.toLowerCase())) {
                matches.push({ line: lineNum, term });
              }
            });
          });
  
          if (matches.length === 0) return null;
  
          // Extract context for each match
          const contexts = [];
          matches.forEach(match => {
            const startLine = Math.max(0, match.line - 1);
            const endLine = Math.min(contentLines.length - 1, match.line + 1);
            
            // Get context lines
            const contextLines = contentLines.slice(startLine, endLine + 1);
            let context = contextLines.join('\n');
  
            // Highlight matched terms
            searchTerms.forEach(term => {
              const variations = term.toLowerCase().includes('dr.') || 
                               term.toLowerCase().includes('doctor') ?
                [term] :
                [term, `Dr. ${term}`, `Dr ${term}`, `Doctor ${term}`];
              
              variations.forEach(variant => {
                const regex = new RegExp(`(${variant})`, 'gi');
                context = context.replace(regex, '**$1**');
              });
            });
  
            contexts.push({
              context,
              lineNumber: match.line
            });
          });
  
          // Remove duplicate contexts and sort by line number
          const uniqueContexts = [...new Set(contexts.map(c => c.context))];
          const formattedText = uniqueContexts.slice(0, 3).join('\n[...]\n');
  
          return {
            filename: path.basename(result.payload.path || ''),
            directory: path.basename(path.dirname(result.payload.path || '')),
            path: result.payload.path,
            relevantContent: {
              text: formattedText,
              highlights: [...new Set(matches.map(m => m.term))]
            },
            score: result.score
          };
        }));
  
      const validResults = processedResults
        .filter(result => result !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
  
      return validResults;
    } catch (error) {
      console.error('Error in semantic search:', error);
      throw error;
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
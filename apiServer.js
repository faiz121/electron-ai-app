import express from 'express';
import cors from 'cors';
import qdrantService from './qdrantService.js';

class APIServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.port = 3000;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(cors({
      origin: ['http://localhost:3000', 'app://.*'],
      methods: ['GET', 'POST'],
      credentials: true
    }));
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    // Local search endpoint
    this.app.post('/api/local', async (req, res) => {
      try {
        const startTime = Date.now();
        const { query } = req.body;
        
        if (!query) {
          return res.status(400).json({
            success: false,
            error: 'Query is required',
            code: 'MISSING_QUERY'
          });
        }

        await qdrantService.initialize();
        const results = await qdrantService.searchSimilarDocuments(query);
        
        const transformedResults = results.map(result => {
          // Extract context for preview
          const matchedContent = result.relevantContent?.text || '';
          const contextParts = matchedContent.split('...');
          
          return {
            filename: result.filename,
            path: result.path,
            matchedText: matchedContent,
            score: result.score,
            highlights: result.relevantContent?.highlights || [],
            preview: {
              beforeContext: contextParts[0] || '',
              matchedContent: contextParts[1] || matchedContent,
              afterContext: contextParts[2] || ''
            }
          };
        });

        const searchTime = ((Date.now() - startTime) / 1000).toFixed(3);

        res.json({
          success: true,
          results: transformedResults,
          metadata: {
            totalResults: transformedResults.length,
            searchTime: `${searchTime}s`
          }
        });

      } catch (error) {
        console.error('Error in local search:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'SEARCH_ERROR'
        });
      }
    });

    // LLM query endpoint
    this.app.post('/api/ask', async (req, res) => {
      try {
        const startTime = Date.now();
        const { query } = req.body;
        
        if (!query) {
          return res.status(400).json({
            success: false,
            error: 'Query is required',
            code: 'MISSING_QUERY'
          });
        }

        const prompt = `Please answer the following question in clear, professional, and concise English. Avoid providing long and unnecessary explanations. Keep it to the point. Return the response like this {"response": "answer" }\n\n${query}`;

        const llmResponse = await this.askQuestion_llm_helper(query, prompt);

        const processingTime = ((Date.now() - startTime) / 1000).toFixed(3);

        res.json({
          success: true,
          response: {
            answer: JSON.parse(llmResponse).response,
            confidence: 0.95, // This should be provided by your LLM if available
            sources: [], // Optional: Add sources if your LLM provides them
            metadata: {
              processingTime: `${processingTime}s`,
              modelUsed: "llama3.2"
            }
          }
        });

      } catch (error) {
        console.error('Error in LLM query:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          code: 'LLM_ERROR'
        });
      }
    });
  }

  async askQuestion_llm_helper(content, prompt) {
    try {
      const url = "http://localhost:11434/api/generate";
      const data = {
        "model": "llama3.2",
        "prompt": prompt,
        "format": "json",
        "stream": false,
      };
      
      const headers = {
        'Content-Type': 'application/json',
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
      console.log('result-------->', result)
      return result?.response ?? 'No answer received';
      
    } catch (error) {
      console.error('LLM helper error:', error);
      throw error;
    }
  }

  async start() {
    try {
      this.server = this.app.listen(this.port, '127.0.0.1', () => {
        console.log(`API Server running at http://127.0.0.1:${this.port}`);
      });
    } catch (error) {
      console.error('Failed to start API server:', error);
      throw error;
    }
  }

  async stop() {
    if (this.server) {
      await new Promise((resolve, reject) => {
        this.server.close(err => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log('API Server stopped');
    }
  }
}

export default new APIServer();
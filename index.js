import express from 'express';
import bodyParser from 'body-parser';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { BraveSearch }  from "@langchain/community/tools/brave_search";
import OpenAI from 'openai';
import cheerio from 'cheerio';
import dotenv from 'dotenv';
dotenv.config();

// initialize express server
const app = express();
const port = 9090;

app.use(bodyParser.json());

// Initialize Groq and OpenAi embeddings
let openai = new OpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
  });

  const embeddings = new OpenAIEmbeddings();

  app.post("/", async (req, res) => {
    console.log("Received POST request");

    // Extract request data
    const { message, returnSources = true, returnFollowUpQuestions = true, embedSourcesInLLMResponse = false, textChunkSize = 800, textChunkOverlap = 200, numberOfSimilarityResults = 2, numberOfPagesToScan = 4 } = req.body;
    console.log(`2. Destructured request data`);

    // A function to rephrase the text input for the search api
    const rephraseInput = async (inputString) => {
        const groqResponse = await openai.chat.completions.create({
            model: "llama3-8b-8192",
            messages: [
                { role: "system", content: "You are a rephraser and always respond with a rephrased version of the input that is given to a search engine API. Always be succint and use the same words as the input. ONLY RETURN THE REPHRASED VERSION OF THE INPUT." },
                { role: "user", content: inputString },
              ], 
        });
        console.log(`Rephrased input and got answer from Groq`);
        return groqResponse.choices[0].message.content;
    }

    // Define search function
    const searchEngineForSources = async (message) => {
        console.log(`3. Initializing Search Engine Process`);
        // Initialize BraveSearch
        const loader = new BraveSearch({ apiKey: process.env.BRAVE_SEARCH_API_KEY });
        // Rephrase the message
        const rephrasedMessage = await rephraseInput(message);
        console.log(`6. Rephrased message and got documents from BraveSearch`);
        // Get documents from BraveSearch 
        const docs = await loader.call(rephrasedMessage, { count: numberOfPagesToScan });
        // Normalize data
        const normalizedData = normalizeData(docs);
        // 15. Process and vectorize the content
        return await Promise.all(normalizedData.map(fetchAndProcess));
      }

       // Normalize data
        const normalizeData = (docs) => {
            return JSON.parse(docs)
            .filter((doc) => doc.title && doc.link && !doc.link.includes("brave.com"))
            .slice(0, numberOfPagesToScan)
            .map(({ title, link }) => ({ title, link }));
        }
        // Fetch page content
        const fetchPageContent = async (link) => {
            console.log(`7. Fetching page content for ${link}`);
            try {
                const response = await fetch(link);
                if (!response.ok) {
                    return ""; // skip if fetch fails
                }
                const text = await response.text();
                return extractMainContent(text, link);
            } catch (error) {
                console.error(`Error fetching page content for ${link}:`, error);
            return '';
            }
        };
  });
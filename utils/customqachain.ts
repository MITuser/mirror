import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { OpenAIChat } from "langchain/llms/openai";

class RateLimiter {
    private static requestCount = 0;
    private static startTime = Date.now();
    private static maxRequestsPerMinute = 200;


    static async handleRateLimiting() {
        const currentTime = Date.now();
        if (currentTime - this.startTime > 60000) {
            this.requestCount = 0;
            this.startTime = currentTime;
        }


        this.requestCount++;
        if (this.requestCount > this.maxRequestsPerMinute) {
            await new Promise(resolve => setTimeout(resolve, 60000 - (currentTime - this.startTime)));
            this.requestCount = 1;
            this.startTime = Date.now();
        }
    }
}


class ChatHistoryBuffer {
    private buffer: string[];
    private maxSize: number;


    constructor(maxSize: number) {
        this.buffer = [];
        this.maxSize = maxSize;
    }


    addMessage(message: string) {
        this.buffer.push(message);
        this.trim();
    }


    getChatHistory(): string {
        return this.buffer.join(' ');
    }


    clear() {
        this.buffer = [];
    }


    private trim() {
        while (this.buffer.length > this.maxSize) {
            this.buffer.shift();
        }
    }
}

interface Metadata {
    text: string;
    source: string;
    pageNumber: number;
    totalPages: number;
    chapter?: number;   // Optional, if not all documents have chapters
    book?: string;      // Optional, if not all documents are from books
  }

interface PineconeResultItem {
    metadata: Metadata;
    values: any;
    text: any;
    value: {
        text: string;
        source: string;
        pageNumber: number;
        totalPages: number;
        chapter?: number;
        book?: string;
        score : any;
    };
}

interface CallResponse {
    text: string;
    sourceDocuments: Array<{
        text: string;
        Source: string;
        Page_Number: number;
        Total_Pages: number;
    }>;
}


interface CustomQAChainOptions {
    returnSourceDocuments: boolean;
    bufferMaxSize: number;
}

// interface QueryResponse {
//     matches: Array<{ id: string }>;
//   }
  
//   interface FetchResponse {
//     vectors: { [key: string]: PineconeResultItem };
//   }




export class CustomQAChain {
    private model: OpenAIChat;
    private index: any;
    private namespaces: string[];
    private options: CustomQAChainOptions;
    private chatHistoryBuffer: ChatHistoryBuffer;
    


    constructor(model: OpenAIChat, index: any, namespaces: string[], options: CustomQAChainOptions) {
        this.model = model;
        this.index = index;
        this.namespaces = namespaces;
        this.options = options;
        this.chatHistoryBuffer = new ChatHistoryBuffer(this.options.bufferMaxSize);


        if (typeof this.index.query !== 'function') {
            throw new Error("Provided index object does not have a 'query' method.");
        }
    }


    public static fromLLM(model: OpenAIChat, index: any, namespaces: string[], options: CustomQAChainOptions): CustomQAChain {
        return new CustomQAChain(model, index, namespaces, options);
    }


    private sanitizeResponse(input: string): string {
        // Only remove the last occurrence of the "+" sign, which is used by OpenAI as a token to indicate the end of the response.
        const sanitized = input.replace(/ \+$/, '');
        return sanitized;



    }
    private async retryRequest<T>(request: () => Promise<T>, maxRetries = 5, delay = 1000, maxDelay = 60000) {
        for (let i = 0; i <= maxRetries; i++) {
            await RateLimiter.handleRateLimiting();
            try {
                return await request();
            } catch (error: any) {
                if (i === maxRetries || ![429, 401,400, 502, 503, 504].includes(error.response?.status)) {
                    throw error;
                }
                delay = Math.min(delay * 2, maxDelay);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    private async getRelevantDocs(question: string, filter: any): Promise<PineconeResultItem[]> {
        const embeddings = new OpenAIEmbeddings();
        const queryEmbedding = await embeddings.embedQuery(question);
    
        if (!queryEmbedding) {
            throw new Error("Failed to generate embedding for the question.");
        }
    
        let fetchedTexts: PineconeResultItem[] = [];
        let remainingDocs = 25;                      // max vector search, adjust accordingly till find optimal
    
        const maxNamespaces = 10;
        const namespacesToSearch = this.namespaces
            .filter(namespace => namespace.includes(filter))
            .slice(0, maxNamespaces);
    
        for (const namespace of namespacesToSearch) {
            const queryResult = await this.retryRequest(async () => {
                return await this.index.query({
                    queryRequest: {
                        vector: queryEmbedding,
                        topK: 5,
                        namespace: namespace,
                        includeMetadata: true,
                    },
                });
            });
    
            let ids: string[] = [];
            if (queryResult && Array.isArray(queryResult.matches)) {
                ids = queryResult.matches.map((match: { id: string }) => match.id);
            } else {
                console.error('No results found or unexpected result structure.');
            }
    
            const numToFetch = Math.min(ids.length, remainingDocs);
    
            if (numToFetch > 0) {
                const fetchResponse = await this.retryRequest(async () => {
                    return await this.index.fetch({
                        ids: ids.slice(0, numToFetch),
                        namespace: namespace,
                    });
                });
    
                const vectorsArray: PineconeResultItem[] = Object.values(fetchResponse.vectors) as PineconeResultItem[];
                fetchedTexts.push(...vectorsArray);
                remainingDocs -= vectorsArray.length;
            }
    
            if (remainingDocs <= 0) {
                break;
            }
        }
    
        return fetchedTexts;  
    }





    // private async getRelevantDocs(question: string, filter: any): Promise<PineconeResultItem[]> {
    //     const embeddings = new OpenAIEmbeddings();
    //     const queryEmbedding = await embeddings.embedQuery(question);
    
    //     if (!queryEmbedding) {
    //         console.error("Failed to generate embedding for the question.");
    //         return [];
    //     }
    
    //     let fetchedTexts: PineconeResultItem[] = [];
    //     let remainingDocs = 30;
    
    //     const namespacesToSearch = this.namespaces
    //         .filter(namespace => namespace.includes(filter))
    //         .slice(0, 10);
    
    //     const queryPromises = namespacesToSearch.map(namespace => this.retryRequest(() =>
    //     this.index.query({
    //     queryRequest: {
    //         vector: queryEmbedding,
    //         topK: Math.min(10, remainingDocs),
    //         namespace: namespace,
    //         includeMetadata: true,
    //     },
    // }) as Promise<QueryResponse> // Cast to the expected type
    //     ));

    //     const queryResults = await Promise.all(queryPromises);
    
    //     let ids: string[] = [];
    //     for (const result of queryResults) {
    //         if (result && Array.isArray(result.matches)) {
    //             ids.push(...result.matches.map((match: { id: string }) => match.id));
    //         } else {
    //             console.error('No results found or unexpected result structure.');
    //         }
    //     }
    
    //     if (ids.length > 0) {
    //         const fetchResponse = await this.retryRequest(() => 
    //         this.index.fetch({
    //             ids: ids.slice(0, remainingDocs),
    //         }) as Promise<FetchResponse> // Cast to the expected type
    //     );
    
    //         if (fetchResponse && fetchResponse.vectors) {
    //             const vectorsArray: PineconeResultItem[] = Object.values(fetchResponse.vectors) as PineconeResultItem[];
    //             fetchedTexts.push(...vectorsArray);
    //         }
    //     }
    
    //     return fetchedTexts;
    // }
    

    // Experimenting making faster searches with namespaces with Timeout Method

    // private async getRelevantDocs(question: string, filter: any): Promise<PineconeResultItem[]> {
    //     const embeddings = new OpenAIEmbeddings();
    //     const queryEmbedding = await embeddings.embedQuery(question);
    
    //     if (!queryEmbedding) {
    //         throw new Error("Failed to generate embedding for the question.");
    //     }
    
    //     let fetchedTexts: PineconeResultItem[] = [];
    //     let remainingDocs = 40;
    
    //     const maxNamespaces = 10;
    //     const timeout = 20000; // 20 seconds
    //     const startTime = Date.now();
    
    //     const namespacesToSearch = this.namespaces
    //         .filter(namespace => namespace.includes(filter))
    //         .slice(0, maxNamespaces);
    
    //     const queries = namespacesToSearch.map(async (namespace) => {
    //         if (remainingDocs <= 0 || (Date.now() - startTime) > timeout) return;
    
    //         const queryResult = await this.retryRequest(async () => {
    //             return await this.index.query({
    //                 queryRequest: {
    //                     vector: queryEmbedding,
    //                     topK: Math.min(10, remainingDocs),
    //                     namespace: namespace,
    //                     includeMetadata: true,
    //                 },
    //             });
    //         });
    
    //         let ids: string[] = [];
    //         if (queryResult && Array.isArray(queryResult.matches)) {
    //             ids = queryResult.matches.map((match: { id: string }) => match.id);
    //         } else {
    //             console.error('No results found or unexpected result structure in namespace:', namespace);
    //             return;
    //         }
    
    //         const numToFetch = Math.min(ids.length, remainingDocs);
    
    //         if (numToFetch > 0) {
    //             const fetchResponse = await this.retryRequest(async () => {
    //                 return await this.index.fetch({
    //                     ids: ids.slice(0, numToFetch),
    //                     namespace: namespace,
    //                 });
    //             });
    
    //             const vectorsArray: PineconeResultItem[] = Object.values(fetchResponse.vectors) as PineconeResultItem[];
    //             fetchedTexts.push(...vectorsArray);
    //             remainingDocs -= vectorsArray.length;
    //         }
    //     });
    
    //     await Promise.all(queries);
    
    //     return fetchedTexts.slice(0, 40); // Ensure we don't return more than the initial max
    // }
    

    public async call({ question, chat_history, namespaceToFilter}: { question: string; chat_history: string, namespaceToFilter: any}, ): Promise<CallResponse> {
       
        const relevantDocs = await this.getRelevantDocs(question, namespaceToFilter);

        const contextTexts = relevantDocs.map(doc => {
            const filename = doc.metadata.source.split('/').pop();
            const metadataText = doc.metadata.text.replace(/\s+/g, ' ').trim();
            return `${metadataText} (Source: ${filename}, Page Number: ${doc.metadata['loc.pageNumber']})`;
        }).join(" ");

        this.chatHistoryBuffer.addMessage(chat_history);

        // const availableTitles =
        // `INFO 2040 Textbook, Probability Cheatsheet v2.0 , Math 21a Review Sheet, Introduction To Probability,
        // 'INFO 2950 Koenecke Syallbus', 'INFO 2950 Lecture 7','INFO 2950 Handbook',

        // 'INFO 2950 Fall 2022 Midterm Solutions',
        // 'INFO 2950 Fall 2022 Midterm Questions',
        // 'INFO 2950 Lecture 1', 
        // 'INFO 2950 Lecture 2',
        // 'INFO 2950 Lecture 3', 
        // 'INFO 2950 Lecture 4', 
        // 'INFO 2950 Lecture 5', 
        // 'INFO 2950 Lecture 6', 
        // 'INFO 2950 Lecture 8', 
        // 'INFO 2950 Lecture 9', 
        // 'INFO 2950 Lecture 10', 
        // 'INFO 2950 Midterm Fall 2023 Review Topics'`;


        const sourceDocuments = relevantDocs.map(vector => {
            return {
                text: vector.metadata.text,
                "Source": vector.metadata.source,
                'Page_Number': vector.metadata['loc.pageNumber'],
                'Total_Pages': vector.metadata['pdf.totalPages']
                // "Chapter": vector.metadata["chapter"]
            };
        });  

        const formattedSourceDocuments = sourceDocuments.map((doc, index) => {
            // Remove newlines and excessive spacing from the text
            const cleanedText = doc.text.replace(/\s+/g, ' ').trim();
            return `- Text: "${cleanedText}", Source: "${doc.Source}", Page Number: ${doc.Page_Number}, Total Pages: ${doc.Total_Pages}`;
          }).join('\n');
       
        const prompt = `

        You are CornellGPT, a super-intelligent AI developed by two brilliant Cornell students, your primary role is to engage in educational conversation and 
        provide accurate and helpful answers to the questions asked by the user based on the school materials you have access to. 
        Never ever make up answers, or give answers that you are uncertain about. When uncertain simply ask the user for more information/details.
       
        (You have the ability to speak every language)
       
        You will answer questions from the user pertaining to the class: ${this.namespaces}. Judge the relevancy of the user's question to the stated class. 
        If the user provides a prompt (question or sentence) that is unrelated to stated class, clearly tell the user that they have selected the class: ${this.namespaces}
        and that this is not relevant to ${this.namespaces}, but, if applicable, still provide the answer to their question as best as possible regardless. You only have
        access to the materials of ${namespaceToFilter}. Otherwise strictly assume the context to be ${this.namespaces}. Thus, always answer in the context of ${this.namespaces}, referencing 
        ${this.namespaces} in every message.
        
        The user's question/query is as follows: ${question}.
       
        Contextual Understanding:
        - The class contents that you have access which are all apart of the class ${namespaceToFilter} are as follows: ${this.namespaces}.
        - When asked specifically about a certain ${this.namespaces}, provide as much specific detail as possible and do not forget to mention details
        relevant to the question. Answer the question to the best of your capability with the guidance of course materials.
       
        Course Materials/Reference Citing:
        - The course materials that you are given access to are as follows: ${formattedSourceDocuments}.
        - You will strive to select the most relevant course materials to develop your answers the user's questions. Always cite the source and page numbers from the course materials when 
        possible. If the course materials are too lengthy or if deemed fit, summarize the material in your response. Never make up information beyond or deviate from the explicit, exact information 
        found in the course materials. If information is not elaborated upon in the course materials simply state the information as is, never make assumptions from the course materials.

        Response Dynamics:
        - Be consistent with your responses. Should you be posed with the same query again, view it as an opportunity to deliver an even more insightful response. Avoid repetition.
         
        Context Relevance:
        - You also have access to previous conversations with user. Do not forget these past conversations. They are as follows: ${chat_history}. Should a question context be a 
        continuation or associated with the prior one found in, use chat history to produce a comprehensive answer. If a question context is distinctive from the history, transition to the new context.

        Handling Various Question-Context Relationships:
        - Directly related: Use course materials to respond accurately,precisely, and explicitly.
        - Somewhat related: If the context isn't directly related to the class, provide the most informed response using course materials.
        - Unrelated: Mention to the user that it is unrelated ${namespaceToFilter}, but proceed to answer the question accurately best as possible.
       
        Feedback Queries:
        - If a query lacks explicitness and if you believe that the provided context does not cover the specifics of the question and is not relevant to the previous conversations
          proactively ask the user for more specific details.
        - Your goal with feedback queries is not just to gather more information, but to ensure the user feels guided and understood in their educational journey. 
          Do not be afraid to ask questions that will guide the user to the right answer.

        Mathematical Inquires:
        - You must surround any math expression, notation, number, variables, anything related to Math with $. For example: $ax^2 + bx + c = 0$.
       
        Engagement Tone:
        - Your interactions should exude positivity. Engage with a confident, outgoing attitude and full energy, keeping in mind your identity as CornellGPT, a creation of two exceptional Cornell students.
        - Refrain from apologizing and saying "I am sorry". You are here to help and assist students. Avoid words such as 'could'.


        To enhance the clarity of your responses, please follow these formatting guidelines:

        1. Bold Text: Use bold text to emphasize key terms, important points, or steps in a process. For example, use bold to highlight the main idea in a summary or the critical steps in a set of instructions.
        2. Italic Text: Use italic text for titles of books, articles, or other publications. You can also use it to emphasize words that require special attention from the reader.
        3. Bullet Points: Use bullet points to organize information into a clear and concise list. This is particularly useful for breaking down complex topics, outlining steps in a process, or listing items.
        - Sub-points can be used for additional details or to elaborate on a main point.
        4. Numbered Lists: Use numbered lists when providing a sequence of steps, ranking items, or listing items in a specific order.
            1. First item
            2. Second item
            3. Third item
        5. Links: Embed hyperlinks to provide references to external resources, further readings, or additional information. Make sure the link text is descriptive and clearly indicates what the reader can expect to find at the link destination.
        6. Quotations: Use quotations to highlight excerpts from texts, statements from individuals, or other direct quotes. Ensure that the source of the quote is properly cited.
        7. Consistency: Maintain consistency in your formatting throughout the response. This helps in providing a professional and polished look to your answers.
        8. Readability: Ensure that your responses are easy to read. Use clear and concise language, and break down complex ideas into simpler terms when necessary.
        9. Spacing and Alignment: Pay attention to the spacing and alignment of text and other elements in your response. Proper spacing and alignment contribute to the overall readability and aesthetic of the response.
        10. When citing from the source materials place the citations in parentheses right next to where the citation was used in the response. Do not group them at the end.
        


        Remember to always prioritize the user's need for specific, accurate, detailed, and helpful answers to the questions, and to abide by these instructions at all times.
        `;
        

          // Create multiple models with different parameters
    const models = [{
        temperature: 0.1,
        modelName: "gpt-4",
    },
    // Add more models with different parameters here if you want to create an ensemble
  ];
       

let response = await this.retryRequest(async () => {
    return await this.model.predict(prompt);
});
if (typeof response === 'undefined') {
    throw new Error("Failed to get a response from the model.");
}


response = this.sanitizeResponse(response);


this.chatHistoryBuffer.addMessage(`Question: ${question}`);


console.log(prompt.length, 'length of prompt');


// remove the following line because `response` is already sanitized and added to the chat history
// const response = this.sanitizeResponse(response);


return {
    text: response,
    sourceDocuments: sourceDocuments
};
}
}

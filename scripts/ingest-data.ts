import fs from 'fs';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { pinecone } from '@/utils/pinecone-client';
import { PDFLoader } from 'langchain/document_loaders/fs/pdf';
import { PINECONE_INDEX_NAME, NAMESPACE_NUMB } from '@/config/pinecone';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';

const filePath = 'docs';

type PdfDocument<T = Record<string, any>> = {
  metadata: T;
  pageContent: string;
};

async function loadDocumentsFromFolder(folderPath: string): Promise<PdfDocument[]> {
  const loader = new DirectoryLoader(folderPath, {
    '.pdf': (path) => new PDFLoader(path),
  });
  return loader.load();
}

export const run = async () => {
  try {
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    // for (const folder of ['INFO_2950']) {
    //   console.log(folder);
    //   // const docs = await loadDocumentsFromFolder(`${filePath}/${folder}`);
    //   // console.log(docs);
      
    // }

    const index = pinecone.Index(PINECONE_INDEX_NAME);

    for (const folder of 
      ['INFO2950_Koenecke_Syallbus',
       'INFO2950_Lec7_20230913',
       'INFO2950-Handbook'
      ]
    
    ) {
      const docs = await loadDocumentsFromFolder(`${filePath}/${folder}`);
      
      const namespace = NAMESPACE_NUMB[folder]; // Assuming folder names map to namespaces

      for (const doc of docs) {
        const splitDocs = await textSplitter.splitDocuments([doc]);

        const json = JSON.stringify(splitDocs);
        await fs.promises.writeFile(`${namespace}-split.json`, json);

        const upsertChunkSize = 50;
        for (let i = 0; i < splitDocs.length; i += upsertChunkSize) {
          const chunk = splitDocs.slice(i, i + upsertChunkSize);
          await PineconeStore.fromDocuments(chunk, new OpenAIEmbeddings(), {
            pineconeIndex: index,
            // namespace: namespace, --- uncomment when 
            textKey: 'text',
          });
        }
      }
    }

    console.log('ingestion complete');
  } catch (error) {
    console.error('Failed to ingest your data', error);
  }
};

(async () => {
  await run();
})();
import os
import shutil
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv
from io import BytesIO

from PyPDF2 import PdfReader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate
from langchain.chains import create_retrieval_chain
import google.generativeai as genai

# --- Setup Logging ---
# This will give us more detailed output in the terminal
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- INITIALIZATION ---
load_dotenv()

app = FastAPI(title="Chat with PDFs Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allows all origins for simplicity
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
FAISS_INDEX_PATH = "faiss_index"

# --- HELPER FUNCTIONS ---

def get_pdf_text(pdf_docs: List[bytes]) -> str:
    text = ""
    for pdf_bytes in pdf_docs:
        try:
            pdf_reader = PdfReader(BytesIO(pdf_bytes))
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text
        except Exception as e:
            logger.error(f"Error reading a PDF: {e}")
            continue
    return text

def get_text_chunks(text: str) -> List[str]:
    # CORRECTED: The class name has been fixed here
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=10000, chunk_overlap=1000)
    chunks = text_splitter.split_text(text)
    return chunks

def get_vector_store(text_chunks: List[str]):
    # This function now raises an exception on failure
    if not text_chunks:
        raise ValueError("Text chunks are empty, cannot create vector store.")
    
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    if os.path.exists(FAISS_INDEX_PATH):
        shutil.rmtree(FAISS_INDEX_PATH)
    vector_store = FAISS.from_texts(text_chunks, embedding=embeddings)
    vector_store.save_local(FAISS_INDEX_PATH)
    logger.info("Vector store created and saved successfully.")

# --- API ENDPOINTS ---

@app.post("/upload")
async def upload_pdfs(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files were uploaded.")
    
    logger.info(f"Received {len(files)} file(s) for processing.")
    
    try:
        pdf_docs_bytes = [await file.read() for file in files]
        
        raw_text = get_pdf_text(pdf_docs_bytes)
        if not raw_text:
            raise HTTPException(status_code=400, detail="Could not extract any text from the provided PDFs.")
        
        text_chunks = get_text_chunks(raw_text)
        
        get_vector_store(text_chunks)

        logger.info("Documents processed successfully.")
        return {
            "status": "success", 
            "message": "Documents processed successfully. You can now ask a question."
        }
    except Exception as e:
        logger.error(f"Failed to process uploaded files: {e}", exc_info=True)
        # Send a specific error message back to the frontend
        raise HTTPException(status_code=500, detail=f"An error occurred during processing: {e}")


class QuestionRequest(BaseModel):
    question: str

@app.post("/ask")
async def ask_question(request: QuestionRequest):
    user_question = request.question
    logger.info(f"Received question: {user_question}")
    
    if not user_question:
        raise HTTPException(status_code=400, detail="No question was provided.")
    if not os.path.exists(FAISS_INDEX_PATH):
        raise HTTPException(status_code=400, detail="No documents have been processed yet. Please upload files first.")

    try:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY not found in .env file. Please check your .env file.")

        embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        db = FAISS.load_local(FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True)
        retriever = db.as_retriever()

        # Using the stable gemini-1.0-pro model
        model = ChatGoogleGenerativeAI(model="models/gemini-2.5-flash", google_api_key=api_key, temperature=0.3)
        
        prompt_template = """
        Answer the question as detailed as possible from the provided context.
        Make sure to provide all the details. If the answer is not in the provided context,
        just say, "The answer is not available in the provided documents."
        Do not provide a speculative or incorrect answer.

        Context:
        {context}

        Question:
        {input}

        Answer:
        """
        prompt = ChatPromptTemplate.from_template(prompt_template)
        
        document_chain = create_stuff_documents_chain(model, prompt)
        retrieval_chain = create_retrieval_chain(retriever, document_chain)

        response = retrieval_chain.invoke({"input": user_question})
        
        logger.info("Successfully generated an answer.")
        return {"answer": response["answer"]}

    except Exception as e:
        logger.error(f"An error occurred during question answering: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An internal error occurred: {e}")

@app.get("/")
def read_root():
    return {"message": "Welcome to the Chat with PDFs Backend!"}



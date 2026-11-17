import { llmResponse } from '@/lib/llm-service';
export const dynamic='force-dynamic';
export async function GET(request:Request){return llmResponse(request,process.env);}
export async function POST(request:Request){return llmResponse(request,process.env);}

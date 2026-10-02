import { NextRequest } from 'next/server';
import { getIdentity,getAnalysis } from '@/lib/auth';
import { getAdminDb } from '@/lib/db';
import { ApiError,ok,errorResponse } from '@/lib/http';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{const identity=await getIdentity(request),{id}=await params;await getAnalysis(identity,id);
    const {data,error}=await getAdminDb().from('llm_exchanges').select('purpose,status,input_tokens,output_tokens,latency_ms').eq('analysis_id',id).limit(2000);
    if(error)throw new ApiError(503,'METRICS_UNAVAILABLE','Không tải được thông tin xử lý.');
    const rows=data??[];return ok({calls:rows.length,failedCalls:rows.filter(r=>r.status==='failed').length,inputTokens:rows.reduce((a,r)=>a+(r.input_tokens??0),0),outputTokens:rows.reduce((a,r)=>a+(r.output_tokens??0),0),latencyMs:rows.reduce((a,r)=>a+(r.latency_ms??0),0),truncated:rows.length===2000});
  }catch(e){return errorResponse(e);}
}

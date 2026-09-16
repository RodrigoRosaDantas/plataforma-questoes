import './study-plan.js';
import './ux-enhancements.js';

const SUPABASE_URL='https://fqqkkyusnzhuuizahkww.supabase.co';
const SUPABASE_KEY='sb_publishable_GfoaAPKtYuSu_UY6wE8jMg_XsVjdWU7';
const SESSION_KEY='plataforma.questoes.supabase.session.v1';
const DEVICE_KEY='plataforma.questoes.device.v1';

let session=null;
let user=null;
let pendingEmail='';
let profileId='';
let status='loading';
let message='';
const listeners=new Set();

const hasSession=()=>Boolean(session?.access_token);
const snapshot=()=>({
  status,
  email:user?.email||pendingEmail||'',
  profileId,
  message,
  authenticated:hasSession()
});
function emit(){const value=snapshot();listeners.forEach(listener=>listener(value));}
function setStatus(next,text=''){status=next;message=text;emit();}
function uuid(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const bytes=new Uint8Array(16);
  if(globalThis.crypto?.getRandomValues)globalThis.crypto.getRandomValues(bytes);
  else for(let index=0;index<bytes.length;index++)bytes[index]=Math.floor(Math.random()*256);
  bytes[6]=(bytes[6]&0x0f)|0x40;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function validUuid(value){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));
}
function deviceId(){
  try{
    const saved=localStorage.getItem(DEVICE_KEY);
    if(validUuid(saved))return saved;
    if(saved)localStorage.removeItem(DEVICE_KEY);
    const next=uuid();
    localStorage.setItem(DEVICE_KEY,next);
    return next;
  }catch{return uuid();}
}
function saveSession(next){
  session=next;
  if(next)localStorage.setItem(SESSION_KEY,JSON.stringify(next));
  else localStorage.removeItem(SESSION_KEY);
}
function readStoredSession(){
  try{
    const raw=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
    return raw&&raw.access_token&&raw.refresh_token?raw:null;
  }catch{return null;}
}
function clearRedirectHash(){
  if(location.hash)history.replaceState({},document.title,location.pathname+location.search);
}
function readRedirectSession(){
  const params=new URLSearchParams(location.hash.replace(/^#/,''));
  const accessToken=params.get('access_token');
  const refreshToken=params.get('refresh_token');
  if(!accessToken||!refreshToken){
    if(params.get('error_description')){message=params.get('error_description');clearRedirectHash();}
    return false;
  }
  const expiresIn=Number(params.get('expires_in')||3600);
  saveSession({
    access_token:accessToken,
    refresh_token:refreshToken,
    expires_at:Math.floor(Date.now()/1000)+expiresIn
  });
  clearRedirectHash();
  return true;
}
async function parseResponse(response){
  const raw=await response.text();
  if(!raw)return null;
  try{return JSON.parse(raw);}catch{return raw;}
}
function errorFrom(data,statusCode){
  const text=typeof data==='string'?data:(data?.msg||data?.message||data?.error_description||data?.error||'');
  return Object.assign(new Error(text||('Supabase respondeu '+statusCode)),{status:statusCode});
}
async function refreshSession(){
  if(!session?.refresh_token)throw new Error('Sessão sem token de renovação.');
  const response=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=refresh_token',{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({refresh_token:session.refresh_token})
  });
  const data=await parseResponse(response);
  if(!response.ok)throw errorFrom(data,response.status);
  saveSession({
    access_token:data.access_token,
    refresh_token:data.refresh_token||session.refresh_token,
    expires_at:Math.floor(Date.now()/1000)+Number(data.expires_in||3600)
  });
  return session;
}
async function request(path,options={},retry=true){
  const headers=Object.assign({apikey:SUPABASE_KEY,Accept:'application/json'},options.headers||{});
  if(options.body!==undefined&&!headers['Content-Type'])headers['Content-Type']='application/json';
  if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
  const response=await fetch(SUPABASE_URL+path,Object.assign({},options,{headers}));
  const data=await parseResponse(response);
  if(response.status===401&&retry&&session?.refresh_token){
    try{await refreshSession();return request(path,options,false);}catch{}
  }
  if(!response.ok)throw errorFrom(data,response.status);
  return data;
}
function redirectTarget(){
  return new URL('./',location.href).href;
}
async function ensureProfile(){
  if(!hasSession())throw new Error('Sessão de nuvem indisponível.');
  if(profileId)return profileId;
  user=user||await request('/auth/v1/user');
  const ensured=await request('/rest/v1/rpc/ensure_student_profile',{method:'POST',body:'{}'});
  profileId=typeof ensured==='string'?ensured:(ensured?.id||ensured?.profile_id||'');
  if(!profileId)throw new Error('Não foi possível preparar o perfil de estudo.');
  pendingEmail='';
  return profileId;
}
async function init(){
  setStatus('loading','Verificando conta…');
  readRedirectSession();
  session=session||readStoredSession();
  if(!session){setStatus('signed_out','');return snapshot();}
  try{
    if(Number(session.expires_at||0)*1000<Date.now()+60000)await refreshSession();
    await ensureProfile();
    setStatus('authenticated','Conta conectada. Confirmando o estado salvo na nuvem…');
  }catch(error){
    if(error.status===401){saveSession(null);user=null;profileId='';setStatus('signed_out','A sessão expirou.');}
    else setStatus('error','Sincronização indisponível agora; o progresso local continua salvo.');
  }
  return snapshot();
}
async function requestMagicLink(email){
  const normalized=String(email||'').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized))throw new Error('Digite um e-mail válido.');
  pendingEmail=normalized;
  setStatus('loading','Enviando link de acesso…');
  try{
    const redirect=encodeURIComponent(redirectTarget());
    await request('/auth/v1/otp?redirect_to='+redirect,{
      method:'POST',
      body:JSON.stringify({email:normalized,create_user:true})
    });
    setStatus('pending','Link enviado. Verifique sua caixa de entrada.');
    return snapshot();
  }catch(error){
    setStatus('error',error.message||'Não foi possível enviar o link.');
    throw error;
  }
}
async function signOut(){
  try{if(session?.access_token)await request('/auth/v1/logout',{method:'POST'},false);}catch{}
  saveSession(null);user=null;pendingEmail='';profileId='';setStatus('signed_out','');
}
function iso(value){
  const numeric=Number(value);
  if(!Number.isFinite(numeric)||numeric<=0)return null;
  const date=new Date(numeric);
  return Number.isNaN(date.getTime())?null:date.toISOString();
}
function normalizedHistory(history){
  return (Array.isArray(history)?history:[]).map(record=>({
    ...record,
    answers:(Array.isArray(record.answers)?record.answers:[]).map(answer=>({
      ...answer,
      clientEventId:validUuid(answer.clientEventId)?answer.clientEventId:uuid()
    }))
  }));
}
function chunks(values,size){const result=[];for(let i=0;i<values.length;i+=size)result.push(values.slice(i,i+size));return result;}
async function syncLocal(history){
  const normalized=normalizedHistory(history);
  if(!hasSession())return {synced:false,history:normalized,count:0};
  setStatus('syncing','Sincronizando progresso…');
  try{
    await ensureProfile();
    // A camada relacional só recebe conclusões com relógio real; o CAS JSON preserva legado sem inventar data.
    const relational=normalized.filter(record=>{
      const finishedAt=Number(record?.finishedAt);
      return Number.isFinite(finishedAt)&&finishedAt>0;
    });
    const sessionRows=relational.map(record=>({
      profile_id:profileId,
      activity_type:'question_set',
      activity_id:String(record.id),
      started_at:iso(record.startedAt)||iso(record.finishedAt),
      ended_at:iso(record.finishedAt),
      duration_ms:Math.max(0,Number(record.elapsedMs)||0)
    }));
    for(const batch of chunks(sessionRows,50))await request('/rest/v1/study_sessions?on_conflict=profile_id,activity_id',{
      method:'POST',
      headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
      body:JSON.stringify(batch)
    });
    const attemptRows=relational.flatMap(record=>record.answers.map(answer=>({
      profile_id:profileId,
      question_id:String(answer.questionId),
      question_set_id:String(record.id),
      answer:answer.given||null,
      is_correct:answer.blank?null:Boolean(answer.isCorrect),
      duration_ms:Math.max(0,Number(answer.time)||0)*1000,
      attempt_number:1,
      answered_at:iso(record.finishedAt),
      client_event_id:answer.clientEventId
    })));
    for(const batch of chunks(attemptRows,500))await request('/rest/v1/question_attempts?on_conflict=profile_id,question_set_id,question_id',{
      method:'POST',
      headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
      body:JSON.stringify(batch)
    });
    setStatus('authenticated','Tentativas enviadas. Finalizando o estado da nuvem…');
    return {synced:true,history:normalized,count:normalized.length};
  }catch(error){
    setStatus('error','Não foi possível sincronizar agora; o progresso local continua salvo.');
    return {synced:false,history:normalized,count:0,error};
  }
}
const CLOUD_PAGE_SIZE=1000;
const CLOUD_MAX_PAGES=100;
async function fetchRows(path,maxPages=CLOUD_MAX_PAGES){
  const rows=[];
  const safePages=Math.max(1,Number(maxPages)||CLOUD_MAX_PAGES);
  for(let page=0;page<safePages;page++){
    const data=await request(path+'&offset='+(page*CLOUD_PAGE_SIZE)+'&limit='+CLOUD_PAGE_SIZE);
    if(!Array.isArray(data)){
      if(page===0)return [];
      throw new Error('Resposta paginada inválida durante a leitura do histórico da nuvem.');
    }
    rows.push(...data);
    if(data.length<CLOUD_PAGE_SIZE)return rows;
    if(page===safePages-1)throw new Error('Histórico da nuvem excedeu o limite seguro de '+(safePages*CLOUD_PAGE_SIZE)+' registros. Sincronização interrompida para evitar truncamento.');
  }
  return rows;
}
async function loadCloudHistory(){
  if(!hasSession())return [];
  const sessions=await fetchRows('/rest/v1/study_sessions?select=activity_id,started_at,ended_at,duration_ms&activity_type=eq.question_set&activity_id=not.is.null&order=ended_at.desc,activity_id.asc');
  const attempts=await fetchRows('/rest/v1/question_attempts?select=question_set_id,question_id,answer,is_correct,duration_ms,answered_at,client_event_id&question_set_id=not.is.null&order=answered_at.asc,question_set_id.asc,question_id.asc');
  const sessionMap=new Map(sessions.filter(row=>row.activity_id).map(row=>[String(row.activity_id),row]));
  const answerMap=new Map();
  const attemptTimeMap=new Map();
  const seenAttempts=new Set();
  attempts.forEach(row=>{
    const key=String(row.question_set_id||''),questionId=String(row.question_id||'');
    if(!key||!questionId)return;
    const attemptKey=key+'::'+questionId;
    if(seenAttempts.has(attemptKey))return;
    seenAttempts.add(attemptKey);
    if(!answerMap.has(key))answerMap.set(key,[]);
    const answeredAt=row.answered_at?new Date(row.answered_at).getTime():0;
    if(Number.isFinite(answeredAt)&&answeredAt>0)attemptTimeMap.set(key,Math.max(Number(attemptTimeMap.get(key))||0,answeredAt));
    answerMap.get(key).push({
      questionId,
      given:row.answer||null,
      correctAnswer:null,
      isCorrect:row.is_correct===true,
      blank:row.answer===null||row.answer==='',
      time:Math.round(Math.max(0,Number(row.duration_ms)||0)/1000),
      disciplina:'',
      assunto:'',
      clientEventId:row.client_event_id||''
    });
  });
  // Uma sessão relacional sem tentativas indica upload parcial; não é uma conclusão canônica.
  // Baterias concluídas, inclusive totalmente em branco, geram uma tentativa por questão.
  const ids=new Set(answerMap.keys());
  return [...ids].map(id=>{
    const row=sessionMap.get(id)||{};
    const answers=answerMap.get(id)||[];
    const correct=answers.filter(answer=>answer.isCorrect).length;
    const blank=answers.filter(answer=>answer.blank).length;
    const wrong=answers.length-correct-blank;
    const endedAt=row.ended_at?new Date(row.ended_at).getTime():0;
    const attemptFinishedAt=Number(attemptTimeMap.get(id))||0;
    const finishedAt=Number.isFinite(endedAt)&&endedAt>0?endedAt:attemptFinishedAt;
    const rawStartedAt=row.started_at?new Date(row.started_at).getTime():0;
    const startedAt=Number.isFinite(rawStartedAt)&&rawStartedAt>0?rawStartedAt:finishedAt;
    const elapsedMs=Number(row.duration_ms)||answers.reduce((sum,answer)=>sum+answer.time*1000,0);
    return {id,finishedAt,startedAt,mode:'training',total:answers.length,correct,wrong,blank,elapsedMs,answers,source:'supabase'};
  }).sort((a,b)=>b.finishedAt-a.finishedAt);
}

async function loadCloudState(){
  if(!hasSession())return null;
  await ensureProfile();
  const rows=await request('/rest/v1/student_progress_states?select=state,state_version,updated_at,device_id&profile_id=eq.'+encodeURIComponent(profileId)+'&limit=1');
  return Array.isArray(rows)?rows[0]||null:null;
}
async function saveCloudState(stateValue,expectedVersion=0){
  if(!hasSession())return {saved:false,conflict:false};
  await ensureProfile();
  const expected=Math.max(0,Number(expectedVersion)||0);
  const payload={
    p_profile_id:profileId,
    p_expected_version:expected,
    p_state:stateValue&&typeof stateValue==='object'?stateValue:{},
    p_device_id:deviceId()
  };
  const result=await request('/rest/v1/rpc/compare_and_swap_student_progress_state',{
    method:'POST',
    headers:{Prefer:'return=representation'},
    body:JSON.stringify(payload)
  });
  const row=Array.isArray(result)?result[0]||{}:result||{};
  if(row.saved===true){
    const updatedAt=row.updated_at||new Date().toISOString();
    const clock=new Date(updatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    setStatus('authenticated','Nuvem atualizada às '+clock+'. Seu progresso está disponível para outros aparelhos conectados à mesma conta.');
    return {saved:true,conflict:false,stateVersion:Number(row.state_version)||expected+1,updatedAt};
  }
  setStatus('syncing','Outro aparelho atualizou a nuvem. Mesclando as alterações…');
  return {saved:false,conflict:true,stateVersion:Number(row.state_version)||0,updatedAt:row.updated_at||null};
}
function historyRecordTime(record){
  const value=Number(record?.finishedAt);
  return Number.isFinite(value)&&value>0?value:Number.POSITIVE_INFINITY;
}
function mergeCanonicalAnswers(canonicalAnswers,fallbackAnswers){
  const canonicalList=Array.isArray(canonicalAnswers)?canonicalAnswers:[];
  const fallbackList=Array.isArray(fallbackAnswers)?fallbackAnswers:[];
  const fallbackByQuestion=new Map(fallbackList.map(answer=>[String(answer?.questionId||''),answer]));
  const metadataKeys=['correctAnswer','concurso','disciplina','assunto','subassunto','questionVersion','questionHash','releaseSnapshotId','sourceSnapshot'];
  const canonicalIds=new Set(canonicalList.map(answer=>String(answer?.questionId||'')).filter(Boolean));
  const mergedCanonical=canonicalList.map(answer=>{
    const fallback=fallbackByQuestion.get(String(answer?.questionId||''));
    if(!fallback)return answer;
    const merged={...fallback,...answer};
    metadataKeys.forEach(key=>{if((answer?.[key]===undefined||answer?.[key]===null||answer?.[key]==='')&&fallback?.[key]!==undefined&&fallback?.[key]!==null&&fallback?.[key]!=='')merged[key]=fallback[key];});
    return merged;
  });
  // Se um upload em lotes falhar no meio, a cópia completa posterior cura apenas questionIds ausentes.
  const missingFallback=fallbackList.filter(answer=>{
    const id=String(answer?.questionId||'');
    if(!id||canonicalIds.has(id))return false;
    canonicalIds.add(id);
    return true;
  });
  return [...mergedCanonical,...missingFallback];
}
function mergeHistory(localHistory,remoteHistory){
  const merged=new Map();
  (Array.isArray(localHistory)?localHistory:[]).forEach(record=>merged.set(String(record.id),record));
  (Array.isArray(remoteHistory)?remoteHistory:[]).forEach(remote=>{
    const id=String(remote.id);
    const local=merged.get(id);
    if(!local){merged.set(id,remote);return;}
    const localTime=historyRecordTime(local),remoteTime=historyRecordTime(remote);
    const canonical=remoteTime<localTime?remote:local;
    const fallback=canonical===local?remote:local;
    const answers=mergeCanonicalAnswers(canonical.answers,fallback.answers);
    const correct=answers.filter(answer=>answer?.isCorrect===true).length;
    const blank=answers.filter(answer=>answer?.blank===true).length;
    const wrong=Math.max(0,answers.length-correct-blank);
    // Métricas derivadas acompanham o array final, inclusive após cura de upload parcial.
    merged.set(id,Object.assign({},fallback,canonical,{answers,total:answers.length,correct,wrong,blank}));
  });
  return [...merged.values()].sort((a,b)=>(Number(b.finishedAt)||0)-(Number(a.finishedAt)||0));
}
export const cloudProgress={
  get snapshot(){return snapshot();},
  subscribe(listener){listeners.add(listener);listener(snapshot());return()=>listeners.delete(listener);},
  init,
  requestMagicLink,
  signOut,
  syncLocal,
  loadCloudHistory,
  loadCloudState,
  saveCloudState,
  mergeHistory
};
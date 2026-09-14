const SUPABASE_URL='https://fqqkkyusnzhuuizahkww.supabase.co';
const SUPABASE_KEY='sb_publishable_GfoaAPKtYuSu_UY6wE8jMg_XsVjdWU7';
const SESSION_KEY='plataforma.questoes.supabase.session.v1';

let session=null;
let user=null;
let pendingEmail='';
let profileId='';
let status='loading';
let message='';
const listeners=new Set();

const snapshot=()=>({
  status,
  email:user?.email||pendingEmail||'',
  profileId,
  message,
  authenticated:status==='authenticated'||status==='syncing'
});
function emit(){const value=snapshot();listeners.forEach(listener=>listener(value));}
function setStatus(next,text=''){status=next;message=text;emit();}
function uuid(){
  return globalThis.crypto?.randomUUID?.()||('evt-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
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
async function init(){
  setStatus('loading','Verificando conta…');
  readRedirectSession();
  session=session||readStoredSession();
  if(!session){setStatus('signed_out','');return snapshot();}
  try{
    if(Number(session.expires_at||0)*1000<Date.now()+60000)await refreshSession();
    user=await request('/auth/v1/user');
    const ensured=await request('/rest/v1/rpc/ensure_student_profile',{method:'POST',body:'{}'});
    profileId=typeof ensured==='string'?ensured:(ensured?.id||ensured?.profile_id||'');
    if(!profileId)throw new Error('Não foi possível preparar o perfil de estudo.');
    pendingEmail='';
    setStatus('authenticated','');
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
    await request('/auth/v1/otp',{
      method:'POST',
      body:JSON.stringify({email:normalized,create_user:true,options:{email_redirect_to:redirectTarget()}})
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
  const date=new Date(Number(value)||Date.now());
  return Number.isNaN(date.getTime())?new Date().toISOString():date.toISOString();
}
function normalizedHistory(history){
  return (Array.isArray(history)?history:[]).map(record=>({
    ...record,
    answers:(Array.isArray(record.answers)?record.answers:[]).map(answer=>({
      ...answer,
      clientEventId:answer.clientEventId||uuid()
    }))
  }));
}
function chunks(values,size){const result=[];for(let i=0;i<values.length;i+=size)result.push(values.slice(i,i+size));return result;}
async function syncLocal(history){
  const normalized=normalizedHistory(history);
  if(!snapshot().authenticated)return {synced:false,history:normalized,count:0};
  setStatus('syncing','Sincronizando progresso…');
  try{
    const sessionRows=normalized.map(record=>({
      profile_id:profileId,
      activity_type:'question_set',
      activity_id:String(record.id),
      started_at:iso(record.startedAt),
      ended_at:iso(record.finishedAt),
      duration_ms:Math.max(0,Number(record.elapsedMs)||0)
    }));
    for(const batch of chunks(sessionRows,50))await request('/rest/v1/study_sessions?on_conflict=profile_id,activity_id',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(batch)
    });
    const attemptRows=normalized.flatMap(record=>record.answers.map(answer=>({
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
    for(const batch of chunks(attemptRows,500))await request('/rest/v1/question_attempts',{
      method:'POST',
      headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
      body:JSON.stringify(batch)
    });
    setStatus('authenticated','');
    return {synced:true,history:normalized,count:normalized.length};
  }catch(error){
    setStatus('error','Não foi possível sincronizar agora; o progresso local continua salvo.');
    return {synced:false,history:normalized,count:0,error};
  }
}
async function fetchRows(path,maxPages=20){
  const rows=[];
  for(let page=0;page<maxPages;page++){
    const data=await request(path+'&offset='+(page*1000)+'&limit=1000');
    if(!Array.isArray(data)){if(page===0)return [];break;}
    rows.push(...data);
    if(data.length<1000)break;
  }
  return rows;
}
async function loadCloudHistory(){
  if(!snapshot().authenticated)return [];
  const sessions=await fetchRows('/rest/v1/study_sessions?select=activity_id,started_at,ended_at,duration_ms&activity_type=eq.question_set&activity_id=not.is.null&order=ended_at.desc');
  const attempts=await fetchRows('/rest/v1/question_attempts?select=question_set_id,question_id,answer,is_correct,duration_ms,answered_at,client_event_id&question_set_id=not.is.null&order=answered_at.desc');
  const sessionMap=new Map(sessions.filter(row=>row.activity_id).map(row=>[String(row.activity_id),row]));
  const answerMap=new Map();
  attempts.forEach(row=>{
    const key=String(row.question_set_id||'');
    if(!key)return;
    if(!answerMap.has(key))answerMap.set(key,[]);
    answerMap.get(key).push({
      questionId:String(row.question_id),
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
  const ids=new Set([...sessionMap.keys(),...answerMap.keys()]);
  return [...ids].map(id=>{
    const row=sessionMap.get(id)||{};
    const answers=answerMap.get(id)||[];
    const correct=answers.filter(answer=>answer.isCorrect).length;
    const blank=answers.filter(answer=>answer.blank).length;
    const wrong=answers.length-correct-blank;
    const finishedAt=row.ended_at?new Date(row.ended_at).getTime():Date.now();
    const startedAt=row.started_at?new Date(row.started_at).getTime():finishedAt;
    const elapsedMs=Number(row.duration_ms)||answers.reduce((sum,answer)=>sum+answer.time*1000,0);
    return {id,finishedAt,startedAt,mode:'training',total:answers.length,correct,wrong,blank,elapsedMs,answers,source:'supabase'};
  }).sort((a,b)=>b.finishedAt-a.finishedAt);
}
function mergeHistory(localHistory,remoteHistory){
  const merged=new Map();
  (Array.isArray(localHistory)?localHistory:[]).forEach(record=>merged.set(String(record.id),record));
  (Array.isArray(remoteHistory)?remoteHistory:[]).forEach(remote=>{
    const id=String(remote.id);
    const local=merged.get(id);
    if(!local){merged.set(id,remote);return;}
    const answers=(local.answers?.length||0)>=(remote.answers?.length||0)?local.answers:remote.answers;
    merged.set(id,Object.assign({},remote,local,{answers}));
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
  mergeHistory
};
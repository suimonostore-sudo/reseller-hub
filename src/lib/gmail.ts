import { decryptSecret,encryptSecret } from "./secrets";
import { prisma } from "./prisma";

export const gmailScope="https://www.googleapis.com/auth/gmail.readonly";
export function oauthConfig(){
 const clientId=process.env.GOOGLE_CLIENT_ID?.trim();
 const secret=process.env.GOOGLE_CLIENT_SECRET?.trim();
 const redirect=process.env.GOOGLE_REDIRECT_URI?.trim();
 if(!clientId||!secret||!redirect) throw new Error("Google OAuth is not configured");
 return {clientId,secret,redirect};
}
export function authUrl(state:string){
 const c=oauthConfig();
 const q=new URLSearchParams({client_id:c.clientId,redirect_uri:c.redirect,response_type:"code",scope:gmailScope,access_type:"offline",prompt:"consent",state});
 return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}
export async function exchangeCode(code:string){
 const c=oauthConfig();
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:c.clientId,client_secret:c.secret,redirect_uri:c.redirect,grant_type:"authorization_code"})});
 if(!r.ok) throw new Error("Google token exchange failed");
 return r.json();
}
export async function accessToken(){
 const a=await prisma.connectedAccount.findUnique({where:{provider:"gmail"}});
 if(!a?.refreshTokenEnc) throw new Error("Gmail is not connected");
 if(a.accessTokenEnc && a.tokenExpiresAt && a.tokenExpiresAt.getTime()>Date.now()+60000) return decryptSecret(a.accessTokenEnc);
 const c=oauthConfig(),refresh=decryptSecret(a.refreshTokenEnc);
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:c.clientId,client_secret:c.secret,refresh_token:refresh,grant_type:"refresh_token"})});
 if(!r.ok){const detail=(await r.text()).slice(0,500);throw new Error(`Could not refresh Gmail token (${r.status})${detail?`: ${detail}`:""}`)}
 const d=await r.json();
 if(!d.access_token) throw new Error("Gmail refresh response did not include an access token");
 await prisma.connectedAccount.update({where:{provider:"gmail"},data:{accessTokenEnc:encryptSecret(d.access_token),tokenExpiresAt:d.expires_in?new Date(Date.now()+Number(d.expires_in)*1000):null}});
 return d.access_token as string;
}
function decode(s?:string){if(!s)return "";return Buffer.from(s.replace(/-/g,"+").replace(/_/g,"/"),"base64").toString("utf8")}
export function messageText(payload:any):string{
 if(payload?.mimeType==="text/plain"&&payload.body?.data)return decode(payload.body.data);
 for(const p of payload?.parts||[]){const t=messageText(p);if(t)return t}
 return payload?.body?.data?decode(payload.body.data):"";
}
function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
export async function gmailJson(path:string){
 const token=await accessToken();
 let last="";
 for(let attempt=0;attempt<4;attempt++){
  const r=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{headers:{Authorization:`Bearer ${token}`}});
  if(r.ok)return r.json();
  last=(await r.text()).slice(0,700);
  if((r.status===403||r.status===429||r.status>=500)&&attempt<3){await sleep(500*Math.pow(2,attempt));continue}
  throw new Error(`Gmail API error ${r.status}${last?`: ${last}`:""}`);
 }
 throw new Error(`Gmail API request failed${last?`: ${last}`:""}`);
}
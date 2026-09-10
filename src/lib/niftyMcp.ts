import type {OAuthClientInformationMixed,OAuthClientMetadata,OAuthClientProvider,OAuthDiscoveryState,OAuthTokens} from "@modelcontextprotocol/client";
import {Client,StreamableHTTPClientTransport,UnauthorizedError,validateClientMetadataUrl} from "@modelcontextprotocol/client";
import {prisma} from "@/src/lib/prisma";
import {decryptSecret,encryptSecret} from "@/src/lib/secrets";

export const NIFTY_MCP_URL="https://api.nifty.ai/api/mcp";
const PROVIDER="nifty_mcp";

type StoredMeta={codeVerifier?:string;discoveryState?:OAuthDiscoveryState};

async function account(){return prisma.connectedAccount.findUnique({where:{provider:PROVIDER}})}

export class PrismaOAuthClientProvider implements OAuthClientProvider{
  private _redirect?:URL;
  constructor(private readonly _redirectUrl:string,private readonly _metadata:OAuthClientMetadata,public readonly clientMetadataUrl?:string){validateClientMetadataUrl(clientMetadataUrl)}
  get redirectUrl(){return this._redirectUrl}
  get clientMetadata(){return this._metadata}
  async clientInformation(){const a=await account();if(!a?.refreshTokenEnc)return undefined;try{return JSON.parse(decryptSecret(a.refreshTokenEnc)) as OAuthClientInformationMixed}catch{return undefined}}
  async saveClientInformation(v:OAuthClientInformationMixed){const a=await account();await prisma.connectedAccount.upsert({where:{provider:PROVIDER},create:{provider:PROVIDER,refreshTokenEnc:encryptSecret(JSON.stringify(v))},update:{refreshTokenEnc:encryptSecret(JSON.stringify(v)),accessTokenEnc:a?.accessTokenEnc}})}
  async tokens(){const a=await account();if(!a?.accessTokenEnc)return undefined;try{return JSON.parse(decryptSecret(a.accessTokenEnc)) as OAuthTokens}catch{return undefined}}
  async saveTokens(v:OAuthTokens){const expiresIn=Number((v as any)?.expires_in);const tokenExpiresAt=Number.isFinite(expiresIn)&&expiresIn>0?new Date(Date.now()+expiresIn*1000):null;await prisma.connectedAccount.upsert({where:{provider:PROVIDER},create:{provider:PROVIDER,accessTokenEnc:encryptSecret(JSON.stringify(v)),connectedAt:new Date(),tokenExpiresAt},update:{accessTokenEnc:encryptSecret(JSON.stringify(v)),connectedAt:new Date(),tokenExpiresAt}})}
  redirectToAuthorization(url:URL){this._redirect=url}
  takeRedirect(){return this._redirect}
  async meta():Promise<StoredMeta>{const a=await account();if(!a?.scopes)return {};try{return JSON.parse(a.scopes)}catch{return {}}}
  async saveMeta(v:StoredMeta){await prisma.connectedAccount.upsert({where:{provider:PROVIDER},create:{provider:PROVIDER,scopes:JSON.stringify(v)},update:{scopes:JSON.stringify(v)}})}
  async saveCodeVerifier(v:string){const m=await this.meta();m.codeVerifier=v;await this.saveMeta(m)}
  async codeVerifier(){const m=await this.meta();if(!m.codeVerifier)throw new Error("No Nifty OAuth code verifier saved");return m.codeVerifier}
  async saveDiscoveryState(v:OAuthDiscoveryState){const m=await this.meta();m.discoveryState=v;await this.saveMeta(m)}
  async discoveryState(){return (await this.meta()).discoveryState}
  async invalidateCredentials(scope:"all"|"client"|"tokens"|"verifier"|"discovery"){
    const a=await account();if(!a)return;
    let access=a.accessTokenEnc,refresh=a.refreshTokenEnc,m=await this.meta();
    // The MCP client may invalidate an expired access token before attempting a
    // refresh. Preserve the separately stored dynamic client registration so
    // the refresh_token grant can still authenticate the registered client.
    if(scope==="all"||scope==="tokens")access=null;
    if(scope==="all"||scope==="client")refresh=null;
    if(scope==="all"||scope==="verifier")delete m.codeVerifier;
    if(scope==="all"||scope==="discovery")delete m.discoveryState;
    await prisma.connectedAccount.update({where:{provider:PROVIDER},data:{accessTokenEnc:access,refreshTokenEnc:refresh,tokenExpiresAt:(scope==="all"||scope==="tokens")?null:a.tokenExpiresAt,scopes:JSON.stringify(m)}})
  }
}

export function callbackUrl(origin:string){return new URL("/api/auth/nifty/callback",origin).toString()}
export function newProvider(origin:string){return new PrismaOAuthClientProvider(callbackUrl(origin),{client_name:"Reseller Hub",redirect_uris:[callbackUrl(origin)],grant_types:["authorization_code","refresh_token"],response_types:["code"],application_type:"web",token_endpoint_auth_method:"client_secret_post"})}

export async function connectNifty(origin:string,finishParams?:URLSearchParams){
  const provider=newProvider(origin);const client=new Client({name:"reseller-hub",version:"1.0.0"},{capabilities:{}});let transport=new StreamableHTTPClientTransport(new URL(NIFTY_MCP_URL),{authProvider:provider});
  if(finishParams){await transport.finishAuth(finishParams);transport=new StreamableHTTPClientTransport(new URL(NIFTY_MCP_URL),{authProvider:provider})}
  try{await client.connect(transport);return {client,provider,transport,authorizationUrl:null as URL|null}}
  catch(e){if(e instanceof UnauthorizedError){return {client,provider,transport,authorizationUrl:provider.takeRedirect()||null}}throw e}
}

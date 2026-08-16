import crypto from "crypto";
function key(){
 const raw=process.env.APP_ENCRYPTION_KEY;
 if(!raw) throw new Error("APP_ENCRYPTION_KEY is not configured");
 return crypto.createHash("sha256").update(raw).digest();
}
export function encryptSecret(value:string){
 const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv("aes-256-gcm",key(),iv);
 const enc=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
 const tag=cipher.getAuthTag();
 return [iv.toString("base64"),tag.toString("base64"),enc.toString("base64")].join(".");
}
export function decryptSecret(value:string){
 const [a,b,c]=value.split(".");
 const decipher=crypto.createDecipheriv("aes-256-gcm",key(),Buffer.from(a,"base64"));
 decipher.setAuthTag(Buffer.from(b,"base64"));
 return Buffer.concat([decipher.update(Buffer.from(c,"base64")),decipher.final()]).toString("utf8");
}
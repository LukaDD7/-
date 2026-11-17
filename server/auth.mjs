import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash,randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export function normalizeEmail(email){return typeof email==='string'?email.trim().toLowerCase():'';}
export async function hashPassword(password){
 if(typeof password!=='string'||password.length<12||password.length>256)throw new Error('Password must contain 12 to 256 characters');
 const salt=randomBytes(16).toString('hex');
 const hash=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:32*1024*1024});
 return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password,stored){
 const [,salt,digest]=String(stored).split(':');
 if(!salt||!digest||typeof password!=='string'||password.length>256)return false;
 const expected=Buffer.from(digest,'hex');
 const actual=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:32*1024*1024});
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export const tokenHash=token=>createHash('sha256').update(token).digest('hex');
export async function createUser(db,email,password,name){
 email=normalizeEmail(email);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw new Error('Invalid email');
 if(typeof name!=='string'||!name.trim()||name.length>80)throw new Error('Invalid display name');
 const id=randomUUID(),hash=await hashPassword(password);
 await db.query('INSERT INTO shixu_users(id,email,display_name,password_hash) VALUES($1,$2,$3,$4)',[id,email,name.trim(),hash]);
 return {id,email,displayName:name.trim()};
}
export async function createSession(db,userId,clientType='web'){
 const token=randomBytes(32).toString('base64url');
 await db.query("INSERT INTO shixu_sessions(token_hash,user_id,expires_at,client_type) VALUES($1,$2,now()+interval '7 days',$3)",[tokenHash(token),userId,clientType]);
 return token;
}
export function sessionToken(request){
 const bearer=request.headers.authorization;
 if(bearer!==undefined)return /^Bearer [A-Za-z0-9_-]{43}$/.test(bearer)?bearer.slice(7):null;
 const value=(request.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('shixu_session='))?.slice(14);
 return value&&/^[A-Za-z0-9_-]{43}$/.test(value)?value:null;
}
export async function authenticatedUser(db,request){
 const token=sessionToken(request);if(!token)return null;
 const {rows}=await db.query('SELECT u.id,u.email,u.display_name,s.client_type FROM shixu_sessions s JOIN shixu_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.client_type=$2',[tokenHash(token),request.headers.authorization!==undefined?'mini':'web']);
 const user=rows[0];return user?{id:user.id,email:user.email,displayName:user.display_name,clientType:user.client_type}:null;
}

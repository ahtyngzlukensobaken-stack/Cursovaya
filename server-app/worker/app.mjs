// Assets and inventory modules are embedded by scripts/build.mjs.
const GITHUB_ORIGIN='https://ahtyngzlukensobaken-stack.github.io';
const COOKIE='__Host-warehouse-session';
const encoder=new TextEncoder();
const now=()=>Math.floor(Date.now()/1000);
class Failure extends Error{constructor(status,message,code='ERROR'){super(message);this.status=status;this.code=code;}}
const fail=(status,msg,code)=>{throw new Failure(status,msg,code)};
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async s=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256));}
function equal(a,b){let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;}
function response(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});}
const clearCookie=()=>`${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
function cookie(req){const bearer=req.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/);if(bearer)return bearer[1];const m=(req.headers.get('Cookie')||'').match(/(?:^|;\s*)__Host-warehouse-session=([a-f0-9]{64})(?:;|$)/);return m?m[1]:null;}
async function body(req){if(!req.headers.get('content-type')?.startsWith('application/json'))fail(415,'Нужен JSON');const reader=req.body?.getReader();if(!reader)return {};let bytes=0,chunks=[];while(true){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>2097152){await reader.cancel();fail(413,'Слишком большой запрос');}chunks.push(r.value);}const all=new Uint8Array(bytes);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}try{return JSON.parse(new TextDecoder().decode(all));}catch{fail(400,'Некорректные данные');}}
const isOwner=(u,env)=>!!u.owner;
const viewUser=(u,env)=>({id:u.id,name:u.name,email:u.email,username:u.username,role:u.role,owner:isOwner(u,env),approved:!!u.approved});
async function sessionUser(req,db){const token=cookie(req);if(!token)return null;const row=await db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(await digest(token),now()).first();return row&&!row.blocked&&row.approved?row:null;}
async function newSession(db,userId){const token=random();await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await digest(token),userId,now()+1209600).run();return `${COOKIE}=${token}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`;}
async function loginResponse(req,db,id,data,status=200){const value=await newSession(db,id);if(req.headers.get('Origin')===GITHUB_ORIGIN)return response({...data,token:value.split(';')[0].split('=')[1]},status);return response(data,status,{'Set-Cookie':value});}
async function rate(req,db,group,limit,seconds,subject=''){const ip=req.headers.get('CF-Connecting-IP')||'unknown';const bucket=await digest(group+':'+(subject||ip)+':'+Math.floor(now()/seconds));const r=await db.prepare('INSERT INTO rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,now()+seconds*2).first();if(r.count>limit)fail(429,'Слишком много попыток. Попробуйте позднее.','RATE_LIMIT');}
function passwordValid(password){if(typeof password!=='string'||password.length<6||password.length>128)fail(400,'Пароль: от 6 до 128 символов');return password;}
function usernameValid(username){const s=typeof username==='string'?username.trim().normalize('NFKC').toLowerCase():'';if(!/^[\p{L}\p{N}_.-]{3,32}$/u.test(s))fail(400,'Логин: 3–32 буквы, цифры, точка, дефис или подчёркивание');return s;}
function fields(b){const email=typeof b.email==='string'?b.email.trim().toLowerCase():'';const password=passwordValid(b.password);if(email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail(400,'Укажите корректную почту');return {email,password};}
async function setupAllowed(b,env){if(typeof b.setupToken!=='string'||! /^[a-f0-9]{64}$/.test(b.setupToken)||!env.ADMIN_SETUP_TOKEN_HASH||!equal(await digest(b.setupToken),env.ADMIN_SETUP_TOKEN_HASH)||now()>Number(env.ADMIN_SETUP_EXPIRES||0))fail(403,'Ссылка настройки недействительна или истекла.');}
function checked(r){if(!r.ok)fail(400,r.error);return r.value;}
function strictInventory(input){
 if(!input||typeof input!=='object')fail(400,'Некорректная резервная копия');
 const s=JSON.parse(JSON.stringify(input)),V=Validation;
 if(s.version!==1)fail(400,'Неподдерживаемая версия данных');
 for(const k of ['items','recipients','issues','returns'])if(!Array.isArray(s[k])||s[k].length>50000)fail(400,'Некорректный раздел '+k);
 if(!s.seq||typeof s.seq!=='object')fail(400,'Отсутствуют счётчики');
 const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
 const map=list=>{const m=new Map();for(const r of list){if(!r||!integer(r.id,1)||m.has(r.id))fail(400,'Неверный или повторяющийся идентификатор');m.set(r.id,r);}return m;};
 const items=map(s.items),recs=map(s.recipients),issues=map(s.issues);map(s.returns);
 for(const [counter,list]of [['item','items'],['recipient','recipients'],['issue','issues'],['ret','returns']])if(!integer(s.seq[counter])||s[list].some(r=>r.id>s.seq[counter]))fail(400,'Неверный счётчик '+counter);
 const codes=new Set(),hands=new Map(),returned=new Map(),damaged=new Map();
 for(const it of s.items){it.code=checked(V.parseCode(it.code));if(codes.has(it.code))fail(400,'Повторный артикул');codes.add(it.code);it.name=checked(V.parseText(it.name,'Наименование',2,100));it.unit=checked(V.parseText(it.unit,'Единица измерения',1,10));it.category=checked(V.parseOptionalText(it.category,'Категория',50));if(!integer(it.total,0,10000)||!integer(it.available,0,it.total)||!integer(it.writtenOff))fail(400,'Неверное количество товара');hands.set(it.id,0);damaged.set(it.id,0);}
 for(const r of s.recipients){r.fullName=checked(V.parseText(r.fullName,'ФИО',3,100));r.department=checked(V.parseOptionalText(r.department,'Подразделение',100));r.phone=checked(V.parsePhone(r.phone));}
 for(const i of s.issues){if(!items.has(i.itemId)||!recs.has(i.recipientId)||!integer(i.quantity,1,10000)||!integer(i.returnedQty,0,i.quantity))fail(400,'Неверная выдача или ссылка на справочник');if(i.number!=='В-'+String(i.id).padStart(6,'0'))fail(400,'Неверный номер выдачи');checked(V.parseDate(i.issueDate));if(i.dueDate){checked(V.parseDate(i.dueDate));if(i.dueDate<i.issueDate)fail(400,'Срок раньше даты выдачи');}else i.dueDate='';i.note=checked(V.parseOptionalText(i.note,'Примечание',200));const status=i.returnedQty===0?'open':i.returnedQty===i.quantity?'closed':'partial';if(i.status!==status)fail(400,'Статус выдачи не соответствует возвратам');hands.set(i.itemId,hands.get(i.itemId)+i.quantity-i.returnedQty);returned.set(i.id,0);}
 for(const r of s.returns){const issue=issues.get(r.issueId);if(!issue||!integer(r.quantity,1,10000)||!['good','damaged'].includes(r.condition))fail(400,'Неверный возврат');checked(V.parseDate(r.returnDate));if(r.returnDate<issue.issueDate)fail(400,'Возврат раньше выдачи');r.note=checked(V.parseOptionalText(r.note,'Примечание',200));returned.set(issue.id,returned.get(issue.id)+r.quantity);if(r.condition==='damaged')damaged.set(issue.itemId,damaged.get(issue.itemId)+r.quantity);}
 for(const i of s.issues)if(returned.get(i.id)!==i.returnedQty)fail(400,'Журнал возвратов не соответствует выдаче');
 for(const it of s.items)if(it.total!==it.available+hands.get(it.id)||it.writtenOff!==damaged.get(it.id))fail(400,'Нарушен баланс остатков или списаний');
 if(encoder.encode(JSON.stringify(s)).length>1800000)fail(413,'Данные слишком велики. Сохраните архив операций.');
 return s;
}
async function warehouseState(db){const r=await db.prepare("SELECT state,revision,updated_at FROM warehouse WHERE id='main'").first();return {state:r?JSON.parse(r.state):new Inventory().toJSON(),revision:r?.revision||0,updatedAt:r?.updated_at||null};}
async function inventoryAPI(req,db,u){const path=new URL(req.url).pathname;
 if(path==='/api/inventory'&&req.method==='GET')return response(await warehouseState(db));
 if(path==='/api/inventory/actions'&&req.method==='POST'){
  const b=await body(req);if(!Number.isInteger(b.revision)||b.revision<0)fail(400,'Некорректная версия данных');
  const current=await warehouseState(db);if(current.revision!==b.revision)fail(409,'Данные изменены другим сотрудником. Обновите страницу и повторите действие.','CONFLICT');
  const inv=new Inventory(current.state),d=b.data||{};let result;
  switch(b.action){case 'addItem':result=inv.addItem(d);break;case 'updateItem':result=inv.updateItem(d.id,d);break;case 'deleteItem':result=inv.deleteItem(d.id);break;case 'addRecipient':result=inv.addRecipient(d);break;case 'deleteRecipient':result=inv.deleteRecipient(d.id);break;case 'issueItem':result=inv.issueItem(d);break;case 'returnItem':result=inv.returnItem(d);break;
   case 'replaceState':if(u.role!=='admin')fail(403,'Восстановление доступно администратору');result=strictInventory(d.state);break;
   case 'clear':if(u.role!=='admin')fail(403,'Очистка доступна администратору');result=new Inventory().toJSON();break;
   default:fail(400,'Неизвестная операция');}
  const next=strictInventory(b.action==='replaceState'||b.action==='clear'?result:inv.toJSON());
  const changes=await db.batch([db.prepare("INSERT INTO warehouse(id,state,revision,updated_at) VALUES('main',?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,revision=warehouse.revision+1,updated_at=excluded.updated_at WHERE warehouse.revision=?").bind(JSON.stringify(next),b.revision+1,now(),b.revision),db.prepare('INSERT INTO warehouse_audit(id,actor_id,action,revision,created_at) SELECT ?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),u.id,b.action,b.revision+1,now())]);
  if(!changes[0].meta.changes)fail(409,'Данные изменены другим сотрудником. Обновите страницу.','CONFLICT');return response({state:next,revision:b.revision+1,result});
 }
 fail(404,'Не найдено');
}

async function api(req,env){const path=new URL(req.url).pathname;const method=req.method;const db=env.DB;if(!db)fail(503,'Хранилище пока недоступно');if(!['GET','POST','PUT','PATCH'].includes(method))fail(405,'Метод не поддерживается');if(method!=='GET'&&![new URL(req.url).origin,GITHUB_ORIGIN].includes(req.headers.get('Origin')))fail(403,'Обновите страницу и повторите действие','ORIGIN');
 if(path==='/api/setup/learner'&&method==='POST'){
  await rate(req,db,'setup',10,3600);const b=await body(req);await setupAllowed(b,env);const used=await db.prepare("SELECT id FROM admin_setup WHERE id='initial-learner'").first();if(used)fail(409,'Начальный аккаунт уже создан');const username=usernameValid(b.username),password=passwordValid(b.password),salt=random(),id=crypto.randomUUID();
  const asAdmin=b.asAdmin===true;
  await db.batch([db.prepare("INSERT INTO users(id,email,username,name,password_hash,salt,role,owner,approved,created_at,last_login) VALUES(?,NULL,?,?,?,?,?,?,1,?,?)").bind(id,username,b.username.trim(),await passwordHash(password,salt),salt,asAdmin?'admin':'user',asAdmin?1:0,now(),now()),db.prepare("INSERT INTO admin_setup(id,user_id,created_at) VALUES('initial-learner',?,?)").bind(id,now()),...(asAdmin?[db.prepare("INSERT INTO admin_setup(id,user_id,created_at) VALUES('owner',?,?)").bind(id,now())]:[])]);return response({ok:true},201);
 }
 if(path==='/api/auth/register'&&method==='POST'){
  await rate(req,db,'register',10,3600);const b=await body(req),{email,password}=fields(b),username=usernameValid(b.username);const name=typeof b.name==='string'?b.name.trim().replace(/\s+/g,' '):b.username.trim();if(name.length<2||name.length>80)fail(400,'Имя: от 2 до 80 символов');
  let setup=false;
  if(b.setupToken!==undefined){await setupAllowed(b,env);const used=await db.prepare("SELECT id FROM admin_setup WHERE id='owner'").first();if(used)fail(409,'Аккаунт владельца уже создан. Войдите по почте и паролю.');setup=true;}
  const existing=await db.prepare('SELECT id FROM users WHERE email=? OR username=?').bind(email,username).first();if(existing)fail(409,'Почта или логин уже заняты. Войдите.');
  const id=crypto.randomUUID(),salt=random(),hash=await passwordHash(password,salt),role=setup?'admin':'user';
  try{const insert=db.prepare('INSERT INTO users(id,email,username,name,password_hash,salt,role,owner,approved,created_at,last_login) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id,email,username,name,hash,salt,role,setup?1:0,setup?1:0,now(),now());if(setup)await db.batch([insert,db.prepare("INSERT INTO admin_setup(id,user_id,created_at) VALUES('owner',?,?)").bind(id,now())]);else await insert.run();}catch(e){if(String(e.message).includes('UNIQUE'))fail(409,'Аккаунт уже существует или ссылка администратора использована. Войдите.');throw e;}
  return setup?loginResponse(req,db,id,{user:{id,email,username,name,role,owner:true,approved:true}},201):response({pending:true,message:'Аккаунт создан. Доступ откроется после подтверждения администратором.'},201);
 }
 if(path==='/api/auth/login'&&method==='POST'){
  await rate(req,db,'login-ip',40,600);const b=await body(req),password=passwordValid(b.password),login=typeof (b.login??b.email)==='string'?(b.login??b.email).trim().normalize('NFKC').toLowerCase():'';if(!login||login.length>254)fail(400,'Укажите логин или почту');await rate(req,db,'login-email',15,600,login);const u=await db.prepare('SELECT * FROM users WHERE email=? OR username=?').bind(login,login).first();const hash=await passwordHash(password,u?.salt||'missing-account-salt');if(!u||u.blocked||!equal(hash,u.password_hash))fail(401,'Неверный логин или пароль, либо аккаунт недоступен.','LOGIN');if(!u.approved)fail(403,'Аккаунт ожидает подтверждения администратором.','PENDING');await db.prepare('UPDATE users SET last_login=? WHERE id=?').bind(now(),u.id).run();return loginResponse(req,db,u.id,{user:viewUser(u,env)});
 }
 const u=await sessionUser(req,db);
 if(path==='/api/me'&&method==='GET')return response({user:u?viewUser(u,env):null});
 if(path==='/api/auth/logout'&&method==='POST'){const t=cookie(req);if(t)await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(t)).run();return response({ok:true},200,{'Set-Cookie':clearCookie()});}
 if(!u)fail(401,'Войдите в аккаунт','AUTH_REQUIRED');
 if(path==='/api/auth/password'&&method==='POST'){
  await rate(req,db,'password',10,600,u.id);const b=await body(req);if(typeof b.currentPassword!=='string'||b.currentPassword.length>128||!equal(await passwordHash(b.currentPassword,u.salt),u.password_hash))fail(400,'Текущий пароль неверный');passwordValid(b.newPassword);const salt=random(),hash=await passwordHash(b.newPassword,salt);
  await db.batch([db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').bind(salt,hash,u.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id)]);return loginResponse(req,db,u.id,{ok:true});
 }
 if(path.startsWith('/api/inventory'))return inventoryAPI(req,db,u);
 if(path.startsWith('/api/admin/')){
  if(u.role!=='admin')fail(403,'Нужны права администратора');
  if(path==='/api/admin/users'&&method==='GET'){
   const url=new URL(req.url),search=(url.searchParams.get('search')||'').slice(0,100);const offset=Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0));const like='%'+search+'%';
   const rows=await db.prepare('SELECT u.id,u.email,u.username,u.name,u.role,u.owner,u.approved,u.blocked,u.created_at,u.last_login FROM users u WHERE u.name LIKE ? OR u.email LIKE ? ORDER BY u.created_at DESC,u.id LIMIT 51 OFFSET ?').bind(like,like,offset).all();const count=await db.prepare('SELECT COUNT(*) AS total FROM users WHERE name LIKE ? OR email LIKE ?').bind(like,like).first();
   const users=[];for(const row of rows.results.slice(0,50))users.push({...viewUser(row,env),blocked:!!row.blocked,createdAt:row.created_at,lastLogin:row.last_login});
   return response({users,total:count.total,hasMore:rows.results.length>50,offset});
  }
  const match=path.match(/^\/api\/admin\/users\/([a-zA-Z0-9-]+)(\/attempts)?$/);
  if(match){const target=await db.prepare('SELECT * FROM users WHERE id=?').bind(match[1]).first();if(!target)fail(404,'Пользователь не найден');
   if(!match[2]&&method==='PATCH'){
    if(target.id===u.id||isOwner(target,env))fail(400,'Нельзя менять права или блокировать владельца и собственный аккаунт');const b=await body(req);const role=b.role===undefined?target.role:b.role;if(!['user','admin'].includes(role)||b.blocked!==undefined&&typeof b.blocked!=='boolean')fail(400,'Некорректные права');if(b.approved!==undefined&&typeof b.approved!=='boolean')fail(400,'Некорректный статус');const approved=b.approved===undefined?target.approved:b.approved?1:0;const blocked=b.blocked===undefined?target.blocked:b.blocked?1:0;
    await db.batch([db.prepare('UPDATE users SET role=?,blocked=?,approved=? WHERE id=?').bind(role,blocked,approved,target.id),...(blocked?[db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id)]:[]),db.prepare('INSERT INTO audit(id,actor_id,target_id,action,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),u.id,target.id,JSON.stringify({role,blocked:!!blocked,approved:!!approved}),now())]);return response({ok:true});
   }
  }
 }
 fail(404,'Не найдено');
}
async function dispatch(req,env,ctx){const path=new URL(req.url).pathname;try{if(path.startsWith('/api/'))return await api(req,env);const asset=ASSETS[path==='/'?'/index.html':path];if(asset)return new Response(asset.content,{headers:{'Content-Type':asset.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});if(path==='/favicon.ico')return new Response(null,{status:204});return new Response('Не найдено',{status:404});}catch(e){if(e instanceof Failure)return response({error:e.message,code:e.code},e.status);if(e?.name==='InventoryError')return response({error:e.message,code:e.code},400);console.error('Request failed',path,e.name);return response({error:'Временная ошибка сервера. Повторите позднее.'},500);}}
export default {async fetch(req,env,ctx){
 const origin=req.headers.get('Origin'),allowed=origin===GITHUB_ORIGIN||origin===new URL(req.url).origin;
 let result;
 if(req.method==='OPTIONS')result=allowed?new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}}):response({error:'Origin not allowed'},403);
 else result=await dispatch(req,env,ctx);
 if(!allowed)return result;
 const headers=new Headers(result.headers);headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');
 return new Response(result.body,{status:result.status,headers});
}};

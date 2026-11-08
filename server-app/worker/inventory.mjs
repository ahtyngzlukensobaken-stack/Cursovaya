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

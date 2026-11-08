  async function mutate(action, data) {
    if(pending)return false;
    pending=true;document.querySelector('main').inert=true;
    $('save-status').textContent='Сохраняем…';
    try {
      var r=await window.warehouseAPI('/api/inventory/actions','POST',{action:action,data:data,revision:revision});
      inv=new Inventory(r.state);revision=r.revision;render();$('save-status').textContent='Изменения сохранены';return r;
    } catch(e) {
      $('save-status').textContent='Операция не сохранена';
      if(e.code==='CONFLICT') { try {var fresh=await window.warehouseAPI('/api/inventory');inv=new Inventory(fresh.state);revision=fresh.revision;render();}catch(ignore){} }
      toast(e.message,'error');return false;
    } finally {pending=false;document.querySelector('main').inert=false;}
  }
  function resetItemForm(){ $('item-form').reset();$('item-id').value='';$('item-code').disabled=false;$('item-form-title').textContent='Новый товар'; }
  $('item-form').addEventListener('submit',async function(e){e.preventDefault();var id=$('item-id').value;var data={code:$('item-code').value,name:$('item-name').value,unit:$('item-unit').value,category:$('item-category').value,quantity:$('item-qty').value};if(id)data.id=Number(id);if(await mutate(id?'updateItem':'addItem',data)){toast(id?'Товар изменён':'Товар добавлен','ok');resetItemForm();}});
  $('item-cancel').addEventListener('click',resetItemForm);$('item-search').addEventListener('input',renderItems);
  $('items-table').addEventListener('click',async function(e){var ed=e.target.getAttribute('data-edit-item'),del=e.target.getAttribute('data-del-item');if(ed){var it=inv.findItem(Number(ed));$('item-id').value=it.id;$('item-code').value=it.code;$('item-code').disabled=true;$('item-name').value=it.name;$('item-unit').value=it.unit;$('item-category').value=it.category;$('item-qty').value=it.total;$('item-form-title').textContent='Изменение товара '+it.code;window.scrollTo(0,0);}if(del&&await mutate('deleteItem',{id:Number(del)}))toast('Товар удалён','ok');});
  $('rec-form').addEventListener('submit',async function(e){e.preventDefault();if(await mutate('addRecipient',{fullName:$('rec-name').value,department:$('rec-dept').value,phone:$('rec-phone').value})){toast('Получатель добавлен','ok');$('rec-form').reset();}});
  $('recipients-table').addEventListener('click',async function(e){var id=e.target.getAttribute('data-del-rec');if(id&&await mutate('deleteRecipient',{id:Number(id)}))toast('Получатель удалён','ok');});
  $('issue-item').addEventListener('change',renderIssueForm);
  $('issue-form').addEventListener('submit',async function(e){e.preventDefault();var r=await mutate('issueItem',{itemId:$('issue-item').value,recipientId:$('issue-rec').value,quantity:$('issue-qty').value,issueDate:$('issue-date').value,dueDate:$('issue-due').value,note:$('issue-note').value});if(r){toast('Оформлена выдача '+r.result.number,'ok');$('issue-qty').value='1';$('issue-note').value='';}});
  $('return-issue').addEventListener('change',renderReturnForm);
  $('return-form').addEventListener('submit',async function(e){e.preventDefault();if(await mutate('returnItem',{issueId:$('return-issue').value,quantity:$('return-qty').value,returnDate:$('return-date').value,condition:$('return-cond').value,note:$('return-note').value})){toast('Возврат принят','ok');$('return-qty').value='1';$('return-note').value='';}});

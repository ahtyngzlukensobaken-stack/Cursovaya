  $('backup-save').addEventListener('click',function(){download('backup_'+TODAY+'.json',Store.exportJSON(inv),'application/json');});
  $('backup-load').addEventListener('change',async function(e){var f=e.target.files[0];if(!f)return;if(!confirm('Заменить данные общего склада содержимым резервной копии?')){e.target.value='';return;}try{var text=await f.text();var state=JSON.parse(text);if(await mutate('replaceState',{state:state}))toast('Данные восстановлены','ok');}catch(err){toast('Не удалось прочитать корректный JSON','error');}finally{e.target.value='';}});
  $('data-clear').addEventListener('click',async function(){if(confirm('Удалить все данные общего склада? Сначала сохраните резервную копию.'))if(await mutate('clear',{}))toast('Данные очищены','ok');});
  $('demo-load').addEventListener('click',async function(){if(!confirm('Заменить данные общего склада демонстрационными?'))return;
/*DEMO_BUILD*/
    if(await mutate('replaceState',{state:d.toJSON()}))toast('Загружены демонстрационные данные','ok');
  });
  function applyRole(){var admin=account.role==='admin';$('backup-load').closest('label').hidden=!admin;$('demo-load').hidden=!admin;$('data-clear').hidden=!admin;}
  $('today-label').textContent=fmt(TODAY);render();applyRole();
  window.WarehouseApp={get busy(){return pending;},load:function(snapshot,user){inv=new Inventory(snapshot.state);revision=snapshot.revision;account=user;resetItemForm();$('rec-form').reset();$('issue-form').reset();$('return-form').reset();$('item-search').value='';$('journal-search').value='';$('journal-status').value='all';render();applyRole();showTab('home');},get inventory(){return inv;}};
})();

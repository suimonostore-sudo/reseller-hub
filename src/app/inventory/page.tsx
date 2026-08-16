"use client";

import { useEffect, useMemo, useState } from "react";

type BulkBuy = {
  id: number; name: string; purchaseDate: string; totalCost: number;
  purchasedQty: number; unlistedQty: number; notes?: string | null;
};
type Item = {
  id: number; sku: string; title: string; quantity: number; unlisted: boolean;
  cogs: number | null; condition?: string | null; location?: string | null;
  bulkBuyId?: number | null; bulkBuy?: BulkBuy | null;
};

const emptyItem = {sku:"",title:"",quantity:1,cogs:"",condition:"Pre-owned",location:"",bulkBuyId:"",unlisted:true};
const emptyBulk = {name:"",purchaseDate:new Date().toISOString().slice(0,10),totalCost:"",purchasedQty:"",notes:""};

export default function InventoryPage() {
  const [items,setItems]=useState<Item[]>([]), [bulkBuys,setBulkBuys]=useState<BulkBuy[]>([]);
  const [itemForm,setItemForm]=useState<any>(emptyItem), [bulkForm,setBulkForm]=useState<any>(emptyBulk);
  const [editingId,setEditingId]=useState<number|null>(null), [showItem,setShowItem]=useState(false), [showBulk,setShowBulk]=useState(false);
  const [search,setSearch]=useState(""), [busy,setBusy]=useState(false);

  async function load(){
    const [i,b]=await Promise.all([fetch("/api/inventory").then(r=>r.json()),fetch("/api/bulk-buys").then(r=>r.json())]);
    setItems(i); setBulkBuys(b);
  }
  useEffect(()=>{load()},[]);

  const filtered=useMemo(()=>{const q=search.toLowerCase().trim(); if(!q)return items;
    return items.filter(x=>[x.sku,x.title,x.location,x.condition,x.bulkBuy?.name].filter(Boolean).join(" ").toLowerCase().includes(q));
  },[items,search]);

  const bulkStats=useMemo(()=>bulkBuys.map(b=>{
    const assigned=items.filter(i=>i.bulkBuyId===b.id).reduce((s,i)=>s+i.quantity,0);
    return {...b,assigned,remaining:Math.max(0,b.purchasedQty-assigned),calculatedCogs:b.purchasedQty?b.totalCost/b.purchasedQty:0};
  }),[bulkBuys,items]);

  async function saveBulk(e:React.FormEvent){e.preventDefault();setBusy(true);try{
    await fetch("/api/bulk-buys",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...bulkForm,totalCost:Number(bulkForm.totalCost),purchasedQty:Number(bulkForm.purchasedQty)})});
    setBulkForm(emptyBulk);setShowBulk(false);await load();
  }finally{setBusy(false)}}

  function edit(item:Item){setEditingId(item.id);setItemForm({sku:item.sku,title:item.title,quantity:item.quantity,cogs:item.cogs??"",condition:item.condition??"Pre-owned",location:item.location??"",bulkBuyId:item.bulkBuyId??"",unlisted:item.unlisted});setShowItem(true)}
  async function saveItem(e:React.FormEvent){e.preventDefault();setBusy(true);try{
    const url=editingId?`/api/inventory/${editingId}`:"/api/inventory";
    await fetch(url,{method:editingId?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...itemForm,quantity:Number(itemForm.quantity),cogs:itemForm.cogs===""?null:Number(itemForm.cogs),bulkBuyId:itemForm.bulkBuyId?Number(itemForm.bulkBuyId):null})});
    setItemForm(emptyItem);setEditingId(null);setShowItem(false);await load();
  }finally{setBusy(false)}}
  async function del(id:number){if(!confirm("Delete this inventory item?"))return;await fetch(`/api/inventory/${id}`,{method:"DELETE"});await load()}

  return <main className="shell">
    <header className="header"><div><a className="back" href="/">← Dashboard</a><h1>Inventory</h1><p>Manage inventory, bulk purchases, COGS and unlisted quantities.</p></div>
      <div className="actions"><a className="button secondary" href="/pick-pack">Pick & Pack</a><a className="button secondary" href="/listings">Listings</a><a className="button secondary" href="/inventory/bulk-entry">Quick Add</a><button className="secondary" onClick={()=>setShowBulk(true)}>+ Bulk Buy</button><button onClick={()=>{setEditingId(null);setItemForm(emptyItem);setShowItem(true)}}>+ Inventory</button></div>
    </header>

    <section className="cards">
      <div className="card"><span>Inventory Items</span><strong>{items.length}</strong></div>
      <div className="card"><span>Total Units</span><strong>{items.reduce((s,i)=>s+i.quantity,0)}</strong></div>
      <div className="card"><span>Unlisted Units</span><strong>{bulkStats.reduce((s,b)=>s+b.remaining,0)}</strong></div>
      <div className="card"><span>Bulk Purchases</span><strong>{bulkBuys.length}</strong></div>
    </section>

    <section className="panel"><div className="panelHead"><h2>Bulk Purchases</h2><span>Remaining quantity is calculated from assigned inventory</span></div>
      <div className="bulkGrid">{bulkStats.map(b=><div className="bulkCard" key={b.id}>
        <div className="bulkTop"><strong>{b.name}</strong><span>{new Date(b.purchaseDate).toLocaleDateString()}</span></div>
        <div className="bulkNumbers"><div><small>Cost</small><b>${b.totalCost.toFixed(2)}</b></div><div><small>Purchased</small><b>{b.purchasedQty}</b></div><div><small>Assigned</small><b>{b.assigned}</b></div><div><small>Unlisted</small><b>{b.remaining}</b></div></div>
        <div className="progress"><i style={{width:`${Math.min(100,b.purchasedQty?b.assigned/b.purchasedQty*100:0)}%`}}/></div>
        <div className="bulkBottom"><span>Calculated COGS: <b>${b.calculatedCogs.toFixed(2)}/unit</b></span><span>{b.remaining} units unassigned</span></div>
      </div>)}{!bulkStats.length&&<div className="empty">No bulk purchases yet.</div>}</div>
    </section>

    <section className="panel"><div className="toolbar"><div><h2>Inventory Items</h2><span>{filtered.length} shown</span></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search SKU, title, location..."/></div>
      <table><thead><tr><th>SKU</th><th>Title</th><th>COGS</th><th>Qty</th><th>Bulk Buy</th><th>Location</th><th>Status</th><th></th></tr></thead><tbody>
      {filtered.map(i=><tr key={i.id}><td><b>{i.sku}</b></td><td>{i.title}</td><td>{i.cogs==null?"—":`$${i.cogs.toFixed(2)}`}</td><td>{i.quantity}</td><td>{i.bulkBuy?.name??"—"}</td><td>{i.location??"—"}</td><td><span className={"badge "+(i.unlisted?"new":"matched")}>{i.unlisted?"UNLISTED":"LISTED"}</span></td><td className="rowActions"><button className="linkBtn" onClick={()=>edit(i)}>Edit</button><button className="linkBtn danger" onClick={()=>del(i.id)}>Delete</button></td></tr>)}
      </tbody></table>
    </section>

    {showBulk&&<div className="modalWrap" onMouseDown={e=>{if(e.target===e.currentTarget)setShowBulk(false)}}><form className="modal" onSubmit={saveBulk}>
      <div className="modalHead"><h2>Create Bulk Purchase</h2><button type="button" className="x" onClick={()=>setShowBulk(false)}>×</button></div>
      <label>Purchase name<input required value={bulkForm.name} onChange={e=>setBulkForm({...bulkForm,name:e.target.value})} placeholder="July Clothing Buy"/></label>
      <div className="two"><label>Date<input type="date" required value={bulkForm.purchaseDate} onChange={e=>setBulkForm({...bulkForm,purchaseDate:e.target.value})}/></label><label>Purchased quantity<input type="number" min="1" required value={bulkForm.purchasedQty} onChange={e=>setBulkForm({...bulkForm,purchasedQty:e.target.value})}/></label></div>
      <label>Total purchase cost<input type="number" min="0" step="0.01" required value={bulkForm.totalCost} onChange={e=>setBulkForm({...bulkForm,totalCost:e.target.value})}/></label>
      {bulkForm.purchasedQty&&bulkForm.totalCost&&<div className="calculation">Initial COGS: <b>${(Number(bulkForm.totalCost)/Number(bulkForm.purchasedQty)).toFixed(2)}/unit</b></div>}
      <label>Notes<textarea value={bulkForm.notes} onChange={e=>setBulkForm({...bulkForm,notes:e.target.value})}/></label>
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setShowBulk(false)}>Cancel</button><button disabled={busy}>Create Bulk Buy</button></div>
    </form></div>}

    {showItem&&<div className="modalWrap" onMouseDown={e=>{if(e.target===e.currentTarget)setShowItem(false)}}><form className="modal" onSubmit={saveItem}>
      <div className="modalHead"><h2>{editingId?"Edit Inventory":"Add Inventory"}</h2><button type="button" className="x" onClick={()=>setShowItem(false)}>×</button></div>
      <div className="two"><label>SKU<input required value={itemForm.sku} onChange={e=>setItemForm({...itemForm,sku:e.target.value})} placeholder="CAR-002"/></label><label>Quantity<input type="number" min="1" required value={itemForm.quantity} onChange={e=>setItemForm({...itemForm,quantity:e.target.value})}/></label></div>
      <label>Title<input required value={itemForm.title} onChange={e=>setItemForm({...itemForm,title:e.target.value})} placeholder="Carhartt Brown Jacket"/></label>
      <div className="two"><label>COGS per unit<input type="number" min="0" step="0.01" value={itemForm.cogs} onChange={e=>setItemForm({...itemForm,cogs:e.target.value})}/></label><label>Location<input value={itemForm.location} onChange={e=>setItemForm({...itemForm,location:e.target.value})} placeholder="A02"/></label></div>
      <div className="two"><label>Condition<select value={itemForm.condition} onChange={e=>setItemForm({...itemForm,condition:e.target.value})}><option>Pre-owned</option><option>New</option><option>New with tags</option><option>Other</option></select></label><label>Bulk purchase<select value={itemForm.bulkBuyId} onChange={e=>setItemForm({...itemForm,bulkBuyId:e.target.value})}><option value="">None</option>{bulkBuys.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
      <label className="check"><input type="checkbox" checked={itemForm.unlisted} onChange={e=>setItemForm({...itemForm,unlisted:e.target.checked})}/> Currently unlisted</label>
      <div className="hint">Assigning this item to a bulk purchase automatically counts its quantity against that purchase's remaining unassigned quantity.</div>
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setShowItem(false)}>Cancel</button><button disabled={busy}>{editingId?"Save Changes":"Add Inventory"}</button></div>
    </form></div>}
  </main>
}

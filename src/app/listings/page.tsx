"use client";

import { useEffect, useMemo, useState } from "react";

type Platform="EBAY"|"POSHMARK"|"MERCARI"|"DEPOP";
type Item={id:number;sku:string;title:string;quantity:number;unlisted:boolean;cogs:number|null};
type Listing={id:number;platform:Platform;externalId:string;title:string;quantity:number;active:boolean;inventoryItemId:number|null;inventoryItem?:Item|null};

const platforms:Platform[]=["EBAY","POSHMARK","MERCARI","DEPOP"];

export default function ListingsPage(){
  const [items,setItems]=useState<Item[]>([]);
  const [listings,setListings]=useState<Listing[]>([]);
  const [search,setSearch]=useState("");
  const [show,setShow]=useState(false);
  const [editing,setEditing]=useState<Listing|null>(null);
  const [form,setForm]=useState<any>({platform:"EBAY",externalId:"",title:"",quantity:1,active:true,inventoryItemId:""});
  const [busy,setBusy]=useState(false);

  async function load(){
    const [i,l]=await Promise.all([
      fetch("/api/inventory").then(r=>r.json()),
      fetch("/api/listings").then(r=>r.json())
    ]);
    setItems(i);setListings(l);
  }
  useEffect(()=>{load()},[]);

  const filtered=useMemo(()=>{
    const q=search.toLowerCase().trim();
    if(!q)return items;
    return items.filter(i=>{
      const ls=listings.filter(l=>l.inventoryItemId===i.id);
      return [i.sku,i.title,...ls.map(l=>`${l.platform} ${l.title} ${l.externalId}`)].join(" ").toLowerCase().includes(q);
    });
  },[items,listings,search]);

  function openNew(item?:Item){
    setEditing(null);
    setForm({platform:"EBAY",externalId:"",title:item?.title??"",quantity:item?.quantity??1,active:true,inventoryItemId:item?.id??""});
    setShow(true);
  }
  function openEdit(l:Listing){
    setEditing(l);
    setForm({platform:l.platform,externalId:l.externalId,title:l.title,quantity:l.quantity,active:l.active,inventoryItemId:l.inventoryItemId??""});
    setShow(true);
  }
  async function save(e:React.FormEvent){
    e.preventDefault();setBusy(true);
    try{
      await fetch(editing?`/api/listings/${editing.id}`:"/api/listings",{
        method:editing?"PUT":"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...form,quantity:Number(form.quantity),inventoryItemId:form.inventoryItemId?Number(form.inventoryItemId):null})
      });
      setShow(false);await load();
    }finally{setBusy(false)}
  }
  async function del(id:number){
    if(!confirm("Remove this marketplace listing mapping?"))return;
    await fetch(`/api/listings/${id}`,{method:"DELETE"});await load();
  }

  return <main className="shell">
    <header className="header">
      <div><a className="back" href="/inventory">← Inventory</a><h1>Marketplace Listings</h1><p>Map every marketplace listing back to one inventory SKU.</p></div>
      <button onClick={()=>openNew()}>+ Add Listing</button>
    </header>

    <section className="cards">
      <div className="card"><span>SKUs</span><strong>{items.length}</strong></div>
      <div className="card"><span>Mapped Listings</span><strong>{listings.filter(x=>x.inventoryItemId).length}</strong></div>
      <div className="card"><span>Unmapped</span><strong>{listings.filter(x=>!x.inventoryItemId).length}</strong></div>
      <div className="card"><span>Active Listings</span><strong>{listings.filter(x=>x.active).length}</strong></div>
    </section>

    <section className="panel">
      <div className="toolbar"><div><h2>SKU Mapping</h2><span>One SKU can have listings on multiple marketplaces.</span></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search SKU, title or listing ID..."/></div>
      <table><thead><tr><th>SKU</th><th>Inventory Item</th><th>Qty</th><th>Marketplaces</th><th>Actions</th></tr></thead>
      <tbody>{filtered.map(item=>{
        const ls=listings.filter(l=>l.inventoryItemId===item.id);
        return <tr key={item.id}><td><b>{item.sku}</b></td><td>{item.title}</td><td>{item.quantity}</td>
          <td><div className="platformList">{ls.map(l=><span key={l.id} className={"platform "+l.platform.toLowerCase()}>{l.platform} · {l.active?"ACTIVE":"ENDED"}</span>)}{!ls.length&&<span className="muted">No mappings</span>}</div></td>
          <td><button className="linkBtn" onClick={()=>openNew(item)}>+ Map</button>{ls.map(l=><button key={l.id} className="linkBtn" onClick={()=>openEdit(l)}>Edit {l.platform}</button>)}</td>
        </tr>
      })}</tbody></table>
    </section>

    <section className="panel">
      <div className="panelHead"><h2>Unmapped Listings</h2><span>These need to be connected to a SKU.</span></div>
      {listings.filter(l=>!l.inventoryItemId).map(l=><div className="unmapped" key={l.id}>
        <div><b>{l.platform}</b> · {l.title}<small>ID: {l.externalId}</small></div>
        <button className="secondary" onClick={()=>openEdit(l)}>Match to SKU</button>
      </div>)}
      {!listings.some(l=>!l.inventoryItemId)&&<div className="empty">No unmapped listings.</div>}
    </section>

    {show&&<div className="modalWrap" onMouseDown={e=>{if(e.target===e.currentTarget)setShow(false)}}><form className="modal" onSubmit={save}>
      <div className="modalHead"><h2>{editing?"Edit Listing":"Map Listing"}</h2><button type="button" className="x" onClick={()=>setShow(false)}>×</button></div>
      <label>Inventory SKU<select required value={form.inventoryItemId} onChange={e=>setForm({...form,inventoryItemId:e.target.value})}><option value="">Select SKU...</option>{items.map(i=><option key={i.id} value={i.id}>{i.sku} — {i.title}</option>)}</select></label>
      <div className="two"><label>Marketplace<select value={form.platform} onChange={e=>setForm({...form,platform:e.target.value})}>{platforms.map(p=><option key={p}>{p}</option>)}</select></label><label>Listing ID<input required value={form.externalId} onChange={e=>setForm({...form,externalId:e.target.value})} placeholder="123456789"/></label></div>
      <label>Marketplace title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
      <div className="two"><label>Quantity<input type="number" min="0" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label><label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Active listing</label></div>
      <div className="hint">The SKU is the permanent identity. Marketplace IDs/titles can change without changing the inventory record.</div>
      <div className="modalActions"><button type="button" className="secondary" onClick={()=>setShow(false)}>Cancel</button><button disabled={busy}>{editing?"Save Mapping":"Create Mapping"}</button></div>
    </form></div>}
  </main>
}

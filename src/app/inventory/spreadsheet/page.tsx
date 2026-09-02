"use client";

import {useEffect,useMemo,useState} from "react";

type Item={id:number;sku:string;sourceSku?:string|null;title:string;quantity:number;cogs:number|null;condition?:string|null;location?:string|null;workflowStatus?:string;dispositionStatus?:string;disposedAt?:string|null;dispositionNote?:string|null;purchaseStore?:string|null;purchaseDate?:string|null;listDate?:string|null;listPrice?:number|null};
type SaleLine={inventoryItemId?:number|null;quantity:number;unitPrice:number};
type Sale={id:number;platform:string;saleAmount:number;soldAt:string;lines:SaleLine[]};

const money=(v:number|null|undefined)=>v==null?"":`$${Number(v).toFixed(2)}`;
const date=(v:string|null|undefined)=>v?new Date(v).toLocaleDateString():"";
const disposition=(i:Item)=>{const d=i.dispositionStatus||"ACTIVE";if(d==="ACTIVE"&&i.quantity<=0)return"SOLD";if(d==="TRASHED")return"DISCARDED";return d};
const workflow=(i:Item)=>{const d=disposition(i);if(d!=="ACTIVE")return d;return (i.workflowStatus||"LISTED").replaceAll("_"," ")};

export default function SpreadsheetInventoryPage(){
 const[items,setItems]=useState<Item[]>([]),[sales,setSales]=useState<Sale[]>([]),[search,setSearch]=useState(""),[status,setStatus]=useState("ALL");
 useEffect(()=>{Promise.all([fetch("/api/inventory").then(r=>r.json()),fetch("/api/sales").then(r=>r.json())]).then(([inv,s])=>{setItems(Array.isArray(inv)?inv:[]);setSales(Array.isArray(s)?s:[])})},[]);
 const saleByItem=useMemo(()=>{const m=new Map<number,Sale>();for(const sale of sales){for(const line of sale.lines||[]){if(line.inventoryItemId&&!m.has(line.inventoryItemId))m.set(line.inventoryItemId,sale)}}return m},[sales]);
 const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return items.filter(i=>{const st=workflow(i);const matchStatus=status==="ALL"||st===status;const text=[i.sku,i.sourceSku,i.title,i.purchaseStore,i.condition,i.location,i.dispositionNote,st].filter(Boolean).join(" ").toLowerCase();return matchStatus&&(!q||text.includes(q))}).sort((a,b)=>{const ad=a.purchaseDate?new Date(a.purchaseDate).getTime():Number.MAX_SAFE_INTEGER;const bd=b.purchaseDate?new Date(b.purchaseDate).getTime():Number.MAX_SAFE_INTEGER;return ad-bd||a.id-b.id})},[items,search,status]);
 return <main className="shell">
  <nav className="globalNav"><a href="/">Dashboard</a><a href="/inventory">Inventory</a><a href="/inventory/spreadsheet">Spreadsheet View</a><a href="/listings">Listed</a><a href="/sales">Sold</a></nav>
  <header className="header"><div><a className="back" href="/inventory">← Inventory</a><h1>Inventory Spreadsheet</h1><p>All inventory in one Excel-style table, sorted oldest purchase to newest.</p></div><div className="actions"><a className="button secondary" href="/inventory/bulk-entry">Quick Add</a><a className="button" href="/inventory">Inventory Actions</a></div></header>
  <section className="panel"><div className="toolbar"><div><h2>All Inventory</h2><span>{filtered.length} rows shown</span></div><div className="actions"><select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All Statuses</option><option value="NEEDS PHOTOS">Needs Photos</option><option value="PHOTOS DONE">Photos Done</option><option value="LISTED">Listed</option><option value="SOLD">Sold</option><option value="DONATED">Donated</option><option value="DISCARDED">Discarded</option></select><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search inventory..."/></div></div>
   <div style={{overflowX:"auto",width:"100%"}}><table style={{minWidth:1900}}><thead><tr><th>Item</th><th>Purchase Store</th><th>Purchase Price</th><th>Condition</th><th>Date of Purchase</th><th>Location</th><th>Qty</th><th>List Date</th><th>List Price</th><th>RH SKU</th><th>Source SKU</th><th>Status</th><th>Sold Date</th><th>Marketplace</th><th>Sold Price</th><th>Notes / Defects</th></tr></thead><tbody>{filtered.map(i=>{const sale=saleByItem.get(i.id);const line=sale?.lines?.find(l=>l.inventoryItemId===i.id);return <tr key={i.id}><td>{i.title}</td><td>{i.purchaseStore||""}</td><td>{money(i.cogs)}</td><td>{i.condition||""}</td><td>{date(i.purchaseDate)}</td><td>{i.location||""}</td><td>{i.quantity}</td><td>{date(i.listDate)}</td><td>{money(i.listPrice)}</td><td><b>{i.sku}</b></td><td>{i.sourceSku||""}</td><td>{workflow(i)}</td><td>{sale?date(sale.soldAt):""}</td><td>{sale?.platform||""}</td><td>{line?money(line.unitPrice):sale?money(sale.saleAmount):""}</td><td>{i.dispositionNote||""}</td></tr>})}</tbody></table></div>
  </section>
 </main>
}

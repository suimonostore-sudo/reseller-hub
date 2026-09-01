"use client";
import {useEffect,useMemo,useState} from "react";

type Item={id:number;sku:string;title:string;quantity:number;cogs:number|null;workflowStatus?:string;dispositionStatus?:string;listDate?:string|null;listPrice?:number|null;location?:string|null};
type Listing={id:number;platform:string;externalId:string;title:string;active:boolean;inventoryItemId:number|null};

export default function ListingsPage(){
 const[items,setItems]=useState<Item[]>([]),[listings,setListings]=useState<Listing[]>([]),[search,setSearch]=useState("");
 async function load(){const[i,l]=await Promise.all([fetch("/api/inventory").then(r=>r.json()),fetch("/api/listings").then(r=>r.json())]);setItems(i);setListings(l)}
 useEffect(()=>{load()},[]);
 const listed=useMemo(()=>items.filter(i=>(i.dispositionStatus||"ACTIVE")==="ACTIVE"&&i.quantity>0&&i.workflowStatus==="LISTED").filter(i=>{const q=search.toLowerCase().trim();if(!q)return true;const maps=listings.filter(l=>l.inventoryItemId===i.id);return [i.sku,i.title,i.location,...maps.map(m=>`${m.platform} ${m.externalId}`)].filter(Boolean).join(" ").toLowerCase().includes(q)}),[items,listings,search]);
 return <main className="shell">
  <nav className="globalNav"><a href="/">Dashboard</a><a href="/inventory">Inventory</a><a href="/listings">Listed</a><a href="/sales">Sold</a></nav>
  <header className="header"><div><a className="back" href="/">← Dashboard</a><h1>Listed Inventory</h1><p>Items that are ready for sale. Marketplace mapping is shown only when it already exists.</p></div><a className="button" href="/inventory?status=PHOTOS_DONE">Move Items to Listed</a></header>
  <section className="cards"><div className="card"><span>Listed Items</span><strong>{listed.length}</strong></div><div className="card"><span>Listed Units</span><strong>{listed.reduce((n,i)=>n+i.quantity,0)}</strong></div><div className="card"><span>Mapped Marketplace Listings</span><strong>{listings.filter(l=>l.active&&l.inventoryItemId).length}</strong></div></section>
  <section className="panel"><div className="toolbar"><div><h2>Currently Listed</h2><span>Use Inventory to mark an item sold, donated or discarded.</span></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search SKU, item, marketplace..."/></div>
   <table><thead><tr><th>RH SKU</th><th>Item</th><th>Qty</th><th>List Date</th><th>List Price</th><th>Location</th><th>Marketplace</th><th></th></tr></thead><tbody>{listed.map(i=>{const maps=listings.filter(l=>l.inventoryItemId===i.id&&l.active);return <tr key={i.id}><td><b>{i.sku}</b></td><td>{i.title}</td><td>{i.quantity}</td><td>{i.listDate?new Date(i.listDate).toLocaleDateString():"—"}</td><td>{i.listPrice==null?"—":`$${i.listPrice.toFixed(2)}`}</td><td>{i.location||"—"}</td><td>{maps.length?maps.map(m=><span key={m.id} className={"platform "+m.platform.toLowerCase()}>{m.platform}</span>):<span className="muted">Not mapped</span>}</td><td><a className="button secondary" href="/inventory?status=LISTED">Update</a></td></tr>})}</tbody></table>
   {!listed.length&&<div className="empty">No listed inventory matches this view.</div>}
  </section>
 </main>
}

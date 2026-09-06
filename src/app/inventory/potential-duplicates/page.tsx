"use client";
import {useEffect,useMemo,useState} from "react";

type Listing={id:number;platform:string;externalId:string;active:boolean;quantity:number};
type Item={id:number;sku:string;sourceSku?:string|null;title:string;quantity:number;cogs:number|null;workflowStatus:string;dispositionStatus:string;unlisted:boolean;createdAt:string;saleRefs:number;saleUnits:number;listings:Listing[]};
type Group={key:string;count:number;sourceSku?:string|null;title:string;items:Item[]};
const kind=(g:Group)=>g.items.some(i=>i.sku.startsWith("RH-"))&&g.items.some(i=>i.sku.startsWith("FW26-"))?"RH + FW26":g.sourceSku?"Same source SKU":"Same title";
export default function PotentialDuplicates(){
 const[groups,setGroups]=useState<Group[]>([]),[q,setQ]=useState(""),[busy,setBusy]=useState(true);
 useEffect(()=>{fetch("/api/inventory/potential-duplicates").then(r=>r.json()).then(setGroups).finally(()=>setBusy(false))},[]);
 const shown=useMemo(()=>{const s=q.trim().toLowerCase();return !s?groups:groups.filter(g=>[g.title,g.sourceSku,...g.items.flatMap(i=>[i.sku,...i.listings.map(l=>l.externalId)])].filter(Boolean).join(" ").toLowerCase().includes(s))},[groups,q]);
 return <main className="shell">
  <nav className="globalNav"><a href="/">Dashboard</a><a href="/inventory">Inventory</a><a href="/listings">Listed</a><a href="/sales">Sold</a></nav>
  <header className="header"><div><a className="back" href="/inventory">← Inventory</a><h1>Potential Duplicates</h1><p>Review similar inventory records safely. This page never merges or deletes inventory.</p></div></header>
  <section className="cards"><div className="card"><span>Groups to review</span><strong>{groups.length}</strong></div><div className="card"><span>RH + FW26</span><strong>{groups.filter(g=>kind(g)==="RH + FW26").length}</strong></div><div className="card"><span>Touching sales</span><strong>{groups.filter(g=>g.items.some(i=>i.saleRefs>0)).length}</strong></div></section>
  <section className="panel"><div className="toolbar"><div><h2>Review queue</h2><span>{shown.length} groups</span></div><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search title, SKU, eBay ID..."/></div>
   {busy?<p>Loading…</p>:shown.length===0?<p>No potential duplicates found.</p>:shown.map(g=><div key={g.key} style={{borderTop:"1px solid #ddd",padding:"18px 0"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start"}}><div><b>{g.title}</b><small style={{display:"block"}}>{g.sourceSku||"No source SKU"}</small></div><span className="badge new">{kind(g)} · {g.count}</span></div><div style={{overflowX:"auto",marginTop:10}}><table><thead><tr><th>RH SKU</th><th>Qty</th><th>COGS</th><th>Status</th><th>Sales</th><th>Listings</th><th>Created</th></tr></thead><tbody>{g.items.map(i=><tr key={i.id}><td><b>{i.sku}</b></td><td>{i.quantity}</td><td>{i.cogs==null?"—":`$${Number(i.cogs).toFixed(2)}`}</td><td>{i.dispositionStatus}</td><td>{i.saleRefs?`${i.saleRefs} (${i.saleUnits} units)`:"—"}</td><td>{i.listings.length?i.listings.map(l=><small key={l.id} style={{display:"block"}}>{l.platform} {l.externalId} · {l.active?"active":"inactive"} · q{l.quantity}</small>):"—"}</td><td>{new Date(i.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div></div>)}
  </section>
 </main>
}

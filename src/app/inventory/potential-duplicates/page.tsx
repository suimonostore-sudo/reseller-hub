"use client";
import {useEffect,useMemo,useState} from "react";

type Listing={id:number;platform:string;externalId:string;active:boolean;quantity:number};
type Item={id:number;sku:string;sourceSku?:string|null;title:string;quantity:number;cogs:number|null;workflowStatus:string;dispositionStatus:string;unlisted:boolean;createdAt:string;saleRefs:number;saleUnits:number;listings:Listing[]};
type Group={key:string;count:number;sourceSku?:string|null;title:string;items:Item[]};
type Risk="HIGH"|"MEDIUM"|"LIKELY_MULTI";
type Assessment={risk:Risk;reason:string;score:number};
const isRH=(i:Item)=>i.sku.startsWith("RH-");
const isFW=(i:Item)=>i.sku.startsWith("FW26-");
const kind=(g:Group)=>g.items.some(isRH)&&g.items.some(isFW)?"RH + FW26":g.sourceSku?"Same source SKU":"Same title";
const activeListingIds=(g:Group)=>new Set(g.items.flatMap(i=>i.listings.filter(l=>l.active).map(l=>`${l.platform}:${l.externalId}`))).size;
function assess(g:Group):Assessment{
 const rh=g.items.filter(isRH),fw=g.items.filter(isFW),hasSales=g.items.some(i=>i.saleRefs>0),multiQty=g.items.some(i=>i.quantity>1),activeListings=activeListingIds(g);
 if(multiQty||rh.length>1&&fw.length===0)return{risk:"LIKELY_MULTI",score:1,reason:multiQty?"At least one record already represents multiple units.":"Multiple original RH records suggest a batch or separate physical units."};
 if(!g.sourceSku&&activeListings>1)return{risk:"LIKELY_MULTI",score:1,reason:"Same title has multiple distinct active marketplace listings, so these may be separate physical units."};
 if(g.sourceSku&&rh.length===1&&fw.length===1&&!hasSales)return{risk:"HIGH",score:3,reason:"One RH record and one FW26 record share the same source SKU and title with no sale-history conflict."};
 if(g.sourceSku&&rh.length===1&&fw.length>=1)return{risk:"HIGH",score:3,reason:hasSales?"RH/FW26 records share the same source SKU; sale history makes this important to review carefully.":"RH/FW26 records share the same source SKU and title."};
 if(rh.length===1&&fw.length===1)return{risk:"MEDIUM",score:2,reason:"One RH record and one FW26 record share the same title, but there is no source SKU to prove they are the same unit."};
 if(rh.length&&fw.length)return{risk:"MEDIUM",score:2,reason:"RH and FW26 records share the same title, but the group could contain legitimate separate units."};
 return{risk:"LIKELY_MULTI",score:1,reason:g.sourceSku?"Repeated RH records may represent a multi-unit purchase.":"Title-only similarity is weak evidence of a duplicate."};
}
const riskLabel=(r:Risk)=>r==="LIKELY_MULTI"?"LIKELY MULTI-UNIT":r;
export default function PotentialDuplicates(){
 const[groups,setGroups]=useState<Group[]>([]),[q,setQ]=useState(""),[risk,setRisk]=useState<"ALL"|Risk>("ALL"),[busy,setBusy]=useState(true),[error,setError]=useState("");
 useEffect(()=>{fetch("/api/inventory/potential-duplicates").then(async r=>{if(!r.ok)throw new Error((await r.text())||"Could not load duplicate review");return r.json()}).then(setGroups).catch(e=>setError(e.message||"Could not load duplicate review")).finally(()=>setBusy(false))},[]);
 const assessed=useMemo(()=>groups.map(g=>({g,a:assess(g)})).sort((x,y)=>y.a.score-x.a.score||Number(y.g.items.some(i=>i.saleRefs>0))-Number(x.g.items.some(i=>i.saleRefs>0))||y.g.count-x.g.count||x.g.title.localeCompare(y.g.title)),[groups]);
 const counts=useMemo(()=>({HIGH:assessed.filter(x=>x.a.risk==="HIGH").length,MEDIUM:assessed.filter(x=>x.a.risk==="MEDIUM").length,LIKELY_MULTI:assessed.filter(x=>x.a.risk==="LIKELY_MULTI").length}),[assessed]);
 const shown=useMemo(()=>{const s=q.trim().toLowerCase();return assessed.filter(({g,a})=>{if(risk!=="ALL"&&a.risk!==risk)return false;if(!s)return true;return[g.title,g.sourceSku,a.reason,...g.items.flatMap(i=>[i.sku,...i.listings.map(l=>l.externalId)])].filter(Boolean).join(" ").toLowerCase().includes(s)})},[assessed,q,risk]);
 return <main className="shell">
  <nav className="globalNav"><a href="/">Dashboard</a><a href="/inventory">Inventory</a><a href="/listings">Listed</a><a href="/sales">Sold</a></nav>
  <header className="header"><div><a className="back" href="/inventory">← Inventory</a><h1>Potential Duplicates</h1><p>Read-only review queue. High-risk groups appear first; likely multi-unit purchases are intentionally deprioritized.</p></div></header>
  <section className="cards"><button className="card" onClick={()=>setRisk("ALL")}><span>All groups</span><strong>{groups.length}</strong></button><button className="card" onClick={()=>setRisk("HIGH")}><span>High risk</span><strong>{counts.HIGH}</strong></button><button className="card" onClick={()=>setRisk("MEDIUM")}><span>Medium</span><strong>{counts.MEDIUM}</strong></button><button className="card" onClick={()=>setRisk("LIKELY_MULTI")}><span>Likely multi-unit</span><strong>{counts.LIKELY_MULTI}</strong></button></section>
  <section className="panel"><div className="toolbar"><div><h2>Review queue</h2><span>{shown.length} groups · {risk==="ALL"?"all risk levels":riskLabel(risk).toLowerCase()}</span></div><div className="actions"><select value={risk} onChange={e=>setRisk(e.target.value as "ALL"|Risk)}><option value="ALL">ALL RISK LEVELS</option><option value="HIGH">HIGH</option><option value="MEDIUM">MEDIUM</option><option value="LIKELY_MULTI">LIKELY MULTI-UNIT</option></select><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search title, SKU, eBay ID..."/></div></div>
   {busy?<p>Loading…</p>:error?<p>{error}</p>:shown.length===0?<p>No potential duplicates match this view.</p>:shown.map(({g,a})=><div key={g.key} style={{borderTop:"1px solid #ddd",padding:"18px 0"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"start",flexWrap:"wrap"}}><div><b>{g.title}</b><small style={{display:"block"}}>{g.sourceSku||"No source SKU"}</small><small style={{display:"block",marginTop:4}}>{a.reason}</small></div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><span className={"badge "+(a.risk==="HIGH"?"matched":"new")}>{riskLabel(a.risk)}</span><span className="badge new">{kind(g)} · {g.count}</span></div></div><div style={{overflowX:"auto",marginTop:10}}><table><thead><tr><th>RH SKU</th><th>Qty</th><th>COGS</th><th>Status</th><th>Sales</th><th>Listings</th><th>Created</th></tr></thead><tbody>{g.items.map(i=><tr key={i.id}><td><b>{i.sku}</b></td><td>{i.quantity}</td><td>{i.cogs==null?"—":`$${Number(i.cogs).toFixed(2)}`}</td><td>{i.dispositionStatus}{i.unlisted?<small>unlisted</small>:null}</td><td>{i.saleRefs?`${i.saleRefs} (${i.saleUnits} units)`:"—"}</td><td>{i.listings.length?i.listings.map(l=><small key={l.id} style={{display:"block"}}>{l.platform} {l.externalId} · {l.active?"active":"inactive"} · q{l.quantity}</small>):"—"}</td><td>{new Date(i.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div></div>)}
  </section>
 </main>
}

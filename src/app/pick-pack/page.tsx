"use client";

import { useEffect, useMemo, useState } from "react";

type Sale = {
  id:number; platform:string; externalOrderId?:string|null; buyerUsername?:string|null;
  saleAmount:number; fees:number; shippingCost:number; status:string; soldAt:string;
  lines:{id:number;title:string;quantity:number;inventoryItem?:{sku:string;location?:string|null}|null}[];
  shippingLabel?:{trackingNumber?:string|null;filePath?:string|null;skuPrinted?:string|null;buyerPrinted?:string|null}|null;
};

export default function PickPackPage(){
  const [sales,setSales]=useState<Sale[]>([]);
  const [filter,setFilter]=useState("READY");
  const [selected,setSelected]=useState<number[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function load(){setSales(await fetch("/api/sales").then(r=>r.json()));}
  useEffect(()=>{load()},[]);

  const ready=useMemo(()=>sales.filter(s=>["MATCHED","PICKED","PACKED"].includes(s.status)),[sales]);
  const displayed=useMemo(()=>{
    const rows=filter==="READY"?ready:sales.filter(s=>s.status===filter);
    return [...rows].sort((a,b)=>{
      const al=a.lines[0]?.inventoryItem?.location||"ZZZ", bl=b.lines[0]?.inventoryItem?.location||"ZZZ";
      return al.localeCompare(bl)||a.id-b.id;
    });
  },[sales,ready,filter]);

  function toggle(id:number){setSelected(x=>x.includes(id)?x.filter(n=>n!==id):[...x,id]);}
  function selectAll(){setSelected(displayed.map(s=>s.id))}
  function clear(){setSelected([])}

  async function updateStatus(id:number,status:string){
    setBusy(true);setMessage("");
    try{
      const r=await fetch(`/api/sales/${id}/status`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});
      if(!r.ok){const d=await r.json();setMessage(d.error||"Could not update order.");return}
      await load();
    }finally{setBusy(false)}
  }

  async function batch(status:string){
    if(!selected.length)return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch("/api/sales/batch-status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:selected,status})});
      if(!r.ok){const d=await r.json();setMessage(d.error||"Batch update failed.");return}
      const count=selected.length;setSelected([]);setMessage(`${count} order${count===1?'':'s'} marked ${status.toLowerCase()}.`);await load();
    }finally{setBusy(false)}
  }

  function printPickList(){
    const rows=sales.filter(s=>selected.includes(s.id)).sort((a,b)=>(a.lines[0]?.inventoryItem?.location||"ZZZ").localeCompare(b.lines[0]?.inventoryItem?.location||"ZZZ"));
    if(!rows.length){setMessage("Select orders first.");return}
    const labels=rows.flatMap(s=>s.lines.map(l=>{
      const matched=!!l.inventoryItem?.sku;
      const main=matched?l.inventoryItem!.sku:(s.buyerUsername||"NO SKU");
      const sub=matched?(l.inventoryItem!.location||"NO LOCATION"):l.title;
      return `<div class="label"><div class="main">${esc(main)}</div><div class="loc">${esc(sub)}</div><div class="sub">${esc(l.title)} · ${esc(s.platform)}</div></div>`;
    })).join("");
    const w=window.open("","_blank");
    if(!w){setMessage("Allow pop-ups to print.");return}
    w.document.write(`<html><head><title>Pick List</title><style>@page{size:1in 4in;margin:0}body{margin:0;font-family:Arial}.label{width:4in;height:1in;box-sizing:border-box;border-bottom:1px dashed #999;padding:.08in .12in;display:flex;flex-direction:column;justify-content:center;overflow:hidden}.main{font-size:24px;font-weight:800;line-height:1}.loc{font-size:17px;font-weight:700;margin-top:3px}.sub{font-size:10px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media print{.label{break-after:page}}</style></head><body>${labels}</body></html>`);
    w.document.close();w.focus();w.print();
  }

  function printShippingFallback(){
    const rows=sales.filter(s=>selected.includes(s.id));
    if(!rows.length){setMessage("Select orders first.");return}
    const labels=rows.map(s=>`<div class="ship"><div class="name">${esc(s.buyerUsername||"BUYER")}</div><div>${esc(s.platform)} · ${esc(s.externalOrderId||"")}</div><div class="item">${esc(s.lines.map(l=>l.title).join(" / "))}</div></div>`).join("");
    const w=window.open("","_blank"); if(!w){setMessage("Allow pop-ups to print.");return}
    w.document.write(`<html><head><title>Shipping Fallback</title><style>@page{size:4in 6in;margin:0}body{margin:0;font-family:Arial}.ship{width:4in;height:6in;box-sizing:border-box;padding:.35in;border:1px solid #ddd;display:flex;flex-direction:column;justify-content:center}.name{font-size:28px;font-weight:800;margin-bottom:15px}.item{font-size:15px;margin-top:15px}@media print{.ship{break-after:page}}</style></head><body>${labels}</body></html>`);
    w.document.close();w.focus();w.print();
  }

  function esc(v:string){return v.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]!))}

  const noLocation=ready.filter(s=>s.lines.some(l=>l.inventoryItem?.sku&&!l.inventoryItem?.location)).length;
  return <main className="shell">
    <header className="header"><div><a className="back" href="/sales">← Sales</a><h1>Pick & Pack</h1><p>Pick matched orders by storage location, then pack and ship in batches.</p></div>
      <div className="actions"><button className="secondary" onClick={printPickList}>Print Location-Sorted Pick Labels</button><button className="secondary" onClick={printShippingFallback}>Print Shipping Fallback</button></div>
    </header>

    <section className="cards">
      <div className="card"><span>Ready to Pick</span><strong>{sales.filter(s=>s.status==="MATCHED").length}</strong></div>
      <div className="card"><span>Picked</span><strong>{sales.filter(s=>s.status==="PICKED").length}</strong></div>
      <div className="card"><span>Packed</span><strong>{sales.filter(s=>s.status==="PACKED").length}</strong></div>
      <div className="card"><span>Missing Location</span><strong>{noLocation}</strong></div>
    </section>

    <section className="panel">
      <div className="pickToolbar">
        <div className="tabs">{["READY","MATCHED","PICKED","PACKED","SHIPPED"].map(x=><button key={x} className={filter===x?"tab active":"tab"} onClick={()=>{setFilter(x);setSelected([])}}>{x}</button>)}</div>
        <div className="actions"><button className="secondary" onClick={selectAll}>Select Visible</button><button className="secondary" onClick={clear}>Clear</button>
          {selected.length>0&&<><span>{selected.length} selected</span><button onClick={()=>batch("PICKED")} disabled={busy}>Mark Picked</button><button onClick={()=>batch("PACKED")} disabled={busy}>Mark Packed</button><button onClick={()=>batch("SHIPPED")} disabled={busy}>Mark Shipped</button></>}</div>
      </div>

      <table><thead><tr><th></th><th>Status</th><th>Location</th><th>SKU</th><th>Item</th><th>Buyer</th><th>Platform</th><th>Order</th><th></th></tr></thead>
      <tbody>{displayed.map(s=>s.lines.map((l,idx)=><tr key={`${s.id}-${idx}`}>
        <td><input type="checkbox" checked={selected.includes(s.id)} onChange={()=>toggle(s.id)}/></td>
        <td><span className={"badge "+s.status.toLowerCase()}>{s.status}</span></td>
        <td><b>{l.inventoryItem?.location||"—"}</b></td>
        <td><b>{l.inventoryItem?.sku||"NEEDS SKU"}</b></td>
        <td>{l.title}<small className="rowSub">Qty {l.quantity}</small></td>
        <td>{s.buyerUsername||"—"}</td>
        <td>{s.platform}</td>
        <td>{s.externalOrderId||"—"}</td>
        <td>{s.status==="MATCHED"&&<button className="linkBtn" onClick={()=>updateStatus(s.id,"PICKED")}>Pick</button>}{s.status==="PICKED"&&<button className="linkBtn" onClick={()=>updateStatus(s.id,"PACKED")}>Pack</button>}{s.status==="PACKED"&&<button className="linkBtn" onClick={()=>updateStatus(s.id,"SHIPPED")}>Ship</button>}</td>
      </tr>))}</tbody></table>
      {!displayed.length&&<div className="empty">No orders in this queue.</div>}
      {message&&<div className="successMessage">{message}</div>}
    </section>

    <section className="panel">
      <div className="panelHead"><h2>Workflow</h2><span>Location-first picking minimizes walking and searching</span></div>
      <div className="flow"><div><b>1</b><br/>Match sale</div><b>→</b><div><b>2</b><br/>Select batch</div><b>→</b><div><b>3</b><br/>Print location-sorted labels</div><b>→</b><div><b>4</b><br/>Pick & pack</div><b>→</b><div><b>5</b><br/>Mark shipped</div></div>
    </section>
  </main>
}

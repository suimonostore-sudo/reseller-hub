"use client";

import { useEffect, useMemo, useState } from "react";

type BulkBuy = { id:number; name:string; purchasedQty:number; totalCost:number; };
type Row = {
  sku:string; title:string; quantity:number; cogs:string;
  condition:string; location:string; bulkBuyId:string; unlisted:boolean;
};

const blank = ():Row => ({
  sku:"", title:"", quantity:1, cogs:"", condition:"Pre-owned",
  location:"", bulkBuyId:"", unlisted:true
});

function makeSku(prefix:string, n:number) {
  const p = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5) || "SKU";
  return `${p}-${String(n).padStart(4,"0")}`;
}

export default function BulkEntryPage() {
  const [bulkBuys,setBulkBuys]=useState<BulkBuy[]>([]);
  const [rows,setRows]=useState<Row[]>([blank(),blank(),blank()]);
  const [prefix,setPrefix]=useState("INV");
  const [nextNumber,setNextNumber]=useState(1);
  const [selectedBulk,setSelectedBulk]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  useEffect(()=>{
    fetch("/api/bulk-buys").then(r=>r.json()).then(setBulkBuys);
  },[]);

  function update(i:number,key:keyof Row,value:any){
    setRows(r=>r.map((x,n)=>n===i?{...x,[key]:value}:x));
  }

  function generateSkus(){
    setRows(r=>r.map((x,i)=>({...x,sku:x.sku||makeSku(prefix,nextNumber+i)})));
    setNextNumber(n=>n+rows.length);
  }

  function addRows(count=5){
    setRows(r=>[...r,...Array.from({length:count},blank)]);
  }

  async function saveAll(){
    const valid=rows.filter(r=>r.title.trim());
    if(!valid.length){setMessage("Enter at least one item title.");return;}
    setBusy(true);setMessage("");
    let saved=0;
    for(const row of valid){
      const res=await fetch("/api/inventory",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          ...row,
          quantity:Number(row.quantity),
          cogs:row.cogs===""?null:Number(row.cogs),
          bulkBuyId:row.bulkBuyId?Number(row.bulkBuyId):null
        })
      });
      if(res.ok)saved++;
      else {
        const data=await res.json().catch(()=>({}));
        setMessage(`Saved ${saved} items. ${data.error||"One item failed."}`);
        setBusy(false); return;
      }
    }
    setRows([blank(),blank(),blank()]);
    setMessage(`${saved} inventory items added successfully.`);
    setBusy(false);
  }

  const selected = useMemo(
    ()=>bulkBuys.find(b=>String(b.id)===selectedBulk),
    [bulkBuys,selectedBulk]
  );

  return <main className="shell">
    <header className="header">
      <div>
        <a className="back" href="/inventory">← Inventory</a>
        <h1>Quick Add Inventory</h1>
        <p>Add many items at once and generate SKUs automatically.</p>
      </div>
      <div className="actions">
        <button className="secondary" onClick={generateSkus}>Generate Missing SKUs</button>
        <button onClick={saveAll} disabled={busy}>{busy?"Saving...":"Save All Items"}</button>
      </div>
    </header>

    <section className="panel">
      <div className="toolbar">
        <div><h2>Batch Settings</h2><span>These settings can be applied to every blank row.</span></div>
      </div>
      <div className="batchSettings">
        <label>SKU prefix<input value={prefix} onChange={e=>setPrefix(e.target.value)} placeholder="INV"/></label>
        <label>Starting number<input type="number" min="1" value={nextNumber} onChange={e=>setNextNumber(Number(e.target.value))}/></label>
        <label>Bulk purchase<select value={selectedBulk} onChange={e=>{
          setSelectedBulk(e.target.value);
          setRows(rs=>rs.map(r=>({...r,bulkBuyId:e.target.value})));
        }}><option value="">None</option>{bulkBuys.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      </div>
      {selected&&<div className="hint">Selected buy: <b>{selected.name}</b> — ${selected.totalCost.toFixed(2)} / {selected.purchasedQty} units.</div>}
    </section>

    <section className="panel">
      <div className="panelHead"><h2>Items</h2><span>{rows.length} rows</span></div>
      <div className="bulkTableWrap">
        <table className="bulkTable">
          <thead><tr><th>#</th><th>SKU</th><th>Title *</th><th>Qty</th><th>COGS</th><th>Condition</th><th>Location</th><th>Bulk Buy</th><th></th></tr></thead>
          <tbody>{rows.map((r,i)=><tr key={i}>
            <td>{i+1}</td>
            <td><input value={r.sku} onChange={e=>update(i,"sku",e.target.value)} placeholder="INV-0001"/></td>
            <td className="wide"><input value={r.title} onChange={e=>update(i,"title",e.target.value)} placeholder="Item title"/></td>
            <td><input className="smallInput" type="number" min="1" value={r.quantity} onChange={e=>update(i,"quantity",Number(e.target.value))}/></td>
            <td><input className="smallInput" type="number" min="0" step="0.01" value={r.cogs} onChange={e=>update(i,"cogs",e.target.value)} placeholder="3.00"/></td>
            <td><select value={r.condition} onChange={e=>update(i,"condition",e.target.value)}><option>Pre-owned</option><option>New</option><option>New with tags</option><option>Other</option></select></td>
            <td><input value={r.location} onChange={e=>update(i,"location",e.target.value)} placeholder="A01"/></td>
            <td><select value={r.bulkBuyId} onChange={e=>update(i,"bulkBuyId",e.target.value)}><option value="">None</option>{bulkBuys.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></td>
            <td><button className="linkBtn danger" onClick={()=>setRows(rs=>rs.filter((_,n)=>n!==i))}>×</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="tableFooter"><button className="secondary" onClick={()=>addRows(5)}>+ Add 5 Rows</button><button className="secondary" onClick={()=>addRows(10)}>+ Add 10 Rows</button></div>
      {message&&<div className="successMessage">{message}</div>}
    </section>
  </main>;
}

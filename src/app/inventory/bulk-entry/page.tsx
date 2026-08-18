"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

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

function parseCsv(text:string){
  const records:string[][]=[];
  let row:string[]=[],field="",quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted && text[i+1]==='"'){field+='"';i++;}
      else quoted=!quoted;
    } else if(ch===',' && !quoted){row.push(field);field="";}
    else if((ch==='\n'||ch==='\r') && !quoted){
      if(ch==='\r' && text[i+1]==='\n')i++;
      row.push(field);field="";
      if(row.some(v=>v.trim())) records.push(row);
      row=[];
    } else field+=ch;
  }
  row.push(field);
  if(row.some(v=>v.trim()))records.push(row);
  return records;
}

function normalizeHeader(v:string){return v.toLowerCase().replace(/[^a-z0-9]/g,"");}
function pick(record:string[], headers:string[], names:string[]){
  for(const name of names){const at=headers.indexOf(name);if(at>=0)return (record[at]??"").trim();}
  return "";
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
    let used=0;
    setRows(r=>r.map(x=>{
      if(x.sku)return x;
      const next={...x,sku:makeSku(prefix,nextNumber+used)};used++;return next;
    }));
    setNextNumber(n=>n+used);
  }

  function addRows(count=5){
    setRows(r=>[...r,...Array.from({length:count},blank)]);
  }

  async function importCsv(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];
    if(!file)return;
    setMessage("");
    try{
      const records=parseCsv(await file.text());
      if(records.length<2){setMessage("CSV needs a header row and at least one item.");return;}
      const headers=records[0].map(normalizeHeader);
      const imported=records.slice(1).map(record=>{
        const qty=Number(pick(record,headers,["quantity","qty","availablequantity"]))||1;
        return {
          sku:pick(record,headers,["sku","customlabel","customlabelsku","inventorysku"]),
          title:pick(record,headers,["title","itemtitle","name","listingtitle"]),
          quantity:Math.max(1,qty),
          cogs:pick(record,headers,["cogs","cost","costofgoods","itemcost","purchaseprice"]),
          condition:pick(record,headers,["condition","itemcondition"])||"Pre-owned",
          location:pick(record,headers,["location","bin","binlocation","storagelocation"]),
          bulkBuyId:selectedBulk,
          unlisted:true
        } satisfies Row;
      }).filter(r=>r.title);
      if(!imported.length){
        setMessage("No item titles were found. Your CSV should include a Title or Item Title column.");return;
      }
      setRows(imported);
      setMessage(`${imported.length} rows loaded from ${file.name}. Review them, then click Save All Items.`);
    }catch{
      setMessage("I couldn't read that CSV. Please use a standard comma-separated CSV file.");
    }finally{
      e.target.value="";
    }
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
        <p>Add items manually or import an existing inventory CSV.</p>
      </div>
      <div className="actions">
        <label className="secondary" style={{cursor:"pointer"}}>Import CSV<input type="file" accept=".csv,text/csv" onChange={importCsv} style={{display:"none"}}/></label>
        <button className="secondary" onClick={generateSkus}>Generate Missing SKUs</button>
        <button onClick={saveAll} disabled={busy}>{busy?"Saving...":"Save All Items"}</button>
      </div>
    </header>

    <section className="panel">
      <div className="toolbar">
        <div><h2>Batch Settings</h2><span>CSV columns recognized automatically: SKU, Title/Item Title, Qty/Quantity, COGS/Cost, Condition, Location/Bin.</span></div>
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
      {message&&<div className="successMessage">{message}</div>}
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
    </section>
  </main>;
}

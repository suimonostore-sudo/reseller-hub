
"use client";
import {useState} from "react";

export default function AutomationTest(){
 const [form,setForm]=useState<any>({platform:"POSHMARK",externalOrderId:"TEST-1001",externalListingId:"",buyerUsername:"buyer123",title:"",quantity:1,saleAmount:"",fees:"",shippingCost:""});
 const [result,setResult]=useState<any>(null),[busy,setBusy]=useState(false);
 async function submit(e:any){e.preventDefault();setBusy(true);const r=await fetch("/api/sales",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,quantity:Number(form.quantity),saleAmount:Number(form.saleAmount),fees:Number(form.fees||0),shippingCost:Number(form.shippingCost||0),ingestionKey:`SIM|${form.platform}|${form.externalOrderId}`})});setResult(await r.json());setBusy(false);}
 return <main className="shell"><nav className="globalNav"><a href="/">Dashboard</a><a href="/inventory">Inventory</a><a href="/listings">Listings</a><a href="/sales">Sales</a><a href="/pick-pack">Pick & Pack</a><a href="/automation">Automation</a></nav>
 <header className="header"><div><h1>Automation Test</h1><p>Simulate a marketplace sale before connecting Gmail.</p></div></header>
 <section className="panel"><form className="modalLike" onSubmit={submit}>
 <div className="two"><label>Platform<select value={form.platform} onChange={e=>setForm({...form,platform:e.target.value})}>{["EBAY","POSHMARK","MERCARI","DEPOP"].map(x=><option key={x}>{x}</option>)}</select></label><label>Order ID<input value={form.externalOrderId} onChange={e=>setForm({...form,externalOrderId:e.target.value})}/></label></div>
 <label>Listing ID (optional)<input value={form.externalListingId} onChange={e=>setForm({...form,externalListingId:e.target.value})}/></label>
 <label>Item title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
 <div className="two"><label>Buyer<input value={form.buyerUsername} onChange={e=>setForm({...form,buyerUsername:e.target.value})}/></label><label>Quantity<input type="number" min="1" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label></div>
 <div className="two"><label>Sale amount<input type="number" step="0.01" required value={form.saleAmount} onChange={e=>setForm({...form,saleAmount:e.target.value})}/></label><label>Fees<input type="number" step="0.01" value={form.fees} onChange={e=>setForm({...form,fees:e.target.value})}/></label></div>
 <label>Shipping cost<input type="number" step="0.01" value={form.shippingCost} onChange={e=>setForm({...form,shippingCost:e.target.value})}/></label>
 <button disabled={busy}>{busy?"Processing...":"Simulate Sale"}</button></form></section>
 {result&&<section className="panel"><h2>Result</h2><pre className="resultBox">{JSON.stringify(result,null,2)}</pre></section>}</main>
}

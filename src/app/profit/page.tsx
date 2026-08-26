"use client";
import {useEffect,useMemo,useState} from "react";

type Item={cogs:number|null};
type Line={quantity:number;inventoryItem?:Item|null};
type Sale={id:number;platform:string;saleAmount:number;fees:number;shippingCost:number;soldAt:string;status:string;lines:Line[]};
function money(n:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n)}
function calc(s:Sale){const cogs=s.lines.reduce((n,l)=>n+(l.inventoryItem?.cogs||0)*(l.quantity||1),0);return{revenue:s.saleAmount||0,fees:s.fees||0,shipping:s.shippingCost||0,cogs,profit:(s.saleAmount||0)-(s.fees||0)-(s.shippingCost||0)-cogs}}

export default function ProfitPage(){
 const[sales,setSales]=useState<Sale[]>([]),[period,setPeriod]=useState("30");
 useEffect(()=>{fetch('/api/sales').then(r=>r.json()).then(setSales)},[]);
 const filtered=useMemo(()=>{if(period==='ALL')return sales;const days=Number(period),cut=new Date();cut.setDate(cut.getDate()-days);return sales.filter(s=>new Date(s.soldAt)>=cut)},[sales,period]);
 const totals=useMemo(()=>filtered.reduce((a,s)=>{const x=calc(s);a.revenue+=x.revenue;a.fees+=x.fees;a.shipping+=x.shipping;a.cogs+=x.cogs;a.profit+=x.profit;return a},{revenue:0,fees:0,shipping:0,cogs:0,profit:0}),[filtered]);
 const byPlatform=useMemo(()=>{const m:Record<string,{sales:number;revenue:number;fees:number;shipping:number;cogs:number;profit:number}>={};for(const s of filtered){const x=calc(s),r=m[s.platform]||(m[s.platform]={sales:0,revenue:0,fees:0,shipping:0,cogs:0,profit:0});r.sales++;r.revenue+=x.revenue;r.fees+=x.fees;r.shipping+=x.shipping;r.cogs+=x.cogs;r.profit+=x.profit}return Object.entries(m).sort((a,b)=>b[1].profit-a[1].profit)},[filtered]);
 const avg=filtered.length?totals.profit/filtered.length:0,margin=totals.revenue?totals.profit/totals.revenue*100:0;
 return <main className="shell"><header className="header"><div><a className="back" href="/">← Dashboard</a><h1>Profit Dashboard</h1><p>Revenue less marketplace fees, shipping cost and matched inventory COGS.</p></div><div className="actions"><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="ALL">All time</option></select></div></header>
 <section className="cards"><div className="card"><span>Revenue</span><strong>{money(totals.revenue)}</strong></div><div className="card"><span>Net Profit</span><strong>{money(totals.profit)}</strong></div><div className="card"><span>Profit Margin</span><strong>{margin.toFixed(1)}%</strong></div><div className="card"><span>Avg Profit / Sale</span><strong>{money(avg)}</strong></div></section>
 <section className="panel"><div className="panelHead"><div><h2>Cost Breakdown</h2><span>{filtered.length} sale{filtered.length===1?'':'s'} in selected period</span></div></div><div className="health"><div><b>{money(totals.fees)}</b><span>Marketplace Fees</span></div><div><b>{money(totals.shipping)}</b><span>Shipping Cost</span></div><div><b>{money(totals.cogs)}</b><span>COGS</span></div></div></section>
 <section className="panel"><div className="panelHead"><div><h2>Marketplace Performance</h2><span>Profit after fees, shipping and COGS</span></div></div><table><thead><tr><th>Marketplace</th><th>Sales</th><th>Revenue</th><th>Fees</th><th>Shipping</th><th>COGS</th><th>Profit</th><th>Margin</th></tr></thead><tbody>{byPlatform.map(([p,x])=><tr key={p}><td><b>{p}</b></td><td>{x.sales}</td><td>{money(x.revenue)}</td><td>{money(x.fees)}</td><td>{money(x.shipping)}</td><td>{money(x.cogs)}</td><td><b>{money(x.profit)}</b></td><td>{x.revenue?(x.profit/x.revenue*100).toFixed(1):'0.0'}%</td></tr>)}</tbody></table>{!byPlatform.length&&<div className="empty">No sales in this period.</div>}</section>
 <section className="panel"><p className="footnote">Profit is calculated from the sale data RH currently has. Missing marketplace fees, shipping charges or unmatched COGS will make profit appear higher than the final true profit.</p></section></main>
}

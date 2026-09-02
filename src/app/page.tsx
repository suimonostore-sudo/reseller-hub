"use client";
import {useEffect,useState} from "react";

export default function Dashboard(){
 const [s,setS]=useState<any>({});
 useEffect(()=>{fetch("/api/dashboard").then(r=>r.json()).then(setS)},[]);
 const cards=[
  ["Active Inventory","/inventory?status=ACTIVE",s.active||0],
  ["Needs Photos","/inventory?status=NEEDS_PHOTOS",s.needsPhotos||0],
  ["Photos Done","/inventory?status=PHOTOS_DONE",s.photosDone||0],
  ["Listed","/inventory?status=LISTED",s.listed||0],
  ["Sold","/sales",s.sold||0],
  ["Needs Match","/sales?status=NEW",s.needsMatch||0],
  ["Donated","/inventory?status=DONATED",s.donated||0],
  ["Discarded","/inventory?status=DISCARDED",s.discarded||0]
 ];
 return <main className="shell">
  <nav className="globalNav"><a href="/">Dashboard</a><a href="/inventory">Inventory</a><a href="/inventory/spreadsheet">Spreadsheet View</a><a href="/listings">Listed</a><a href="/sales">Sold</a></nav>
  <header className="header"><div><h1>Reseller Hub</h1><p>Track every item from purchase through photos, listing and final disposition.</p></div><div className="actions"><a className="button secondary" href="/inventory/bulk-entry">Quick Add</a><a className="button secondary" href="/inventory/spreadsheet">Spreadsheet View</a><a className="button" href="/inventory">Open Inventory</a></div></header>
  <section className="cards">{cards.map(c=><a className="card dashCard" href={String(c[1])} key={String(c[0])}><span>{c[0]}</span><strong>{c[2]}</strong></a>)}</section>
  <section className="panel"><div className="panelHead"><div><h2>Simple Workflow</h2><span>One item record follows the entire lifecycle.</span></div></div><div className="flow"><a href="/inventory?status=ACTIVE">Inventory In</a><b>→</b><a href="/inventory?status=NEEDS_PHOTOS">Needs Photos</a><b>→</b><a href="/inventory?status=PHOTOS_DONE">Photos Done</a><b>→</b><a href="/inventory?status=LISTED">Listed</a><b>→</b><a href="/sales">Sold</a></div></section>
  <section className="panel"><div className="panelHead"><div><h2>What Reseller Hub Tracks</h2><span>The operating details you need without full accounting complexity.</span></div></div><div className="health"><div><b>Purchase</b><span>COGS · store · date</span></div><div><b>Workflow</b><span>Photos · listed · location</span></div><div><b>Disposition</b><span>Sold · donated · discarded</span></div></div></section>
 </main>
}

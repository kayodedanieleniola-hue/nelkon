"use client";
import { useRouter } from "next/navigation"; import { useState } from "react";
export default function RefreshButton(){const router=useRouter();const [busy,setBusy]=useState(false);return <button type="button" onClick={()=>{setBusy(true);router.refresh();setTimeout(()=>setBusy(false),500)}} disabled={busy} style={button}>{busy?"Refreshing...":"Refresh"}</button>}
const button={background:"transparent",border:"1px solid var(--gold-400)",color:"var(--cream-50)",padding:".5rem 1rem",borderRadius:4,cursor:"pointer",fontSize:".9rem"} as const;

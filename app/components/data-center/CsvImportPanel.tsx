"use client";
import { parseMarketCsv } from "../../../lib/data-center/csv";
import { validateMarketRecord } from "../../../lib/data-center/validation";
import type { MarketDataRecord } from "../../../lib/data-center/types";
export default function CsvImportPanel({ onImport }: { onImport: (records: MarketDataRecord[]) => Promise<void> | void }) {
  return <label style={{display:"inline-flex",padding:"10px 14px",borderRadius:10,border:"1px solid #9db5cb",background:"#f7fbff",fontWeight:800,fontSize:12,cursor:"pointer"}}>CSV ile Toplu Yükle<input type="file" accept=".csv,text/csv" hidden onChange={async(e)=>{const file=e.target.files?.[0];if(!file)return;const rows=parseMarketCsv(await file.text());const valid=rows.filter((r)=>validateMarketRecord(r).length===0);await onImport(valid);e.currentTarget.value="";}}/></label>;
}

"use client";
import { useMemo } from "react";
import type { MarketDataRecord, VerificationStatus } from "../../../lib/data-center/types";
import { calculateDataCenterStats } from "../../../lib/data-center/stats";
import AdminStatistics from "./AdminStatistics";
import DataManagementPanel from "./DataManagementPanel";
import CsvImportPanel from "./CsvImportPanel";
import VerificationTable from "./VerificationTable";
import AiDataInspector from "./AiDataInspector";
export default function TurkiyeDataCenter({records,onSave,onImport,onStatusChange}:{records:MarketDataRecord[];onSave:(r:MarketDataRecord)=>Promise<void>|void;onImport:(r:MarketDataRecord[])=>Promise<void>|void;onStatusChange:(id:string,s:VerificationStatus)=>Promise<void>|void}) { const stats=useMemo(()=>calculateDataCenterStats(records),[records]); return <section style={{display:"grid",gap:16}}><header><div style={{fontSize:11,fontWeight:900,color:"#0d6efd"}}>V67 · MODÜLER VERİ MERKEZİ</div><h2 style={{margin:"6px 0",color:"#153a65"}}>Türkiye Gerçek Veri Yönetim Merkezi</h2><p style={{margin:0,color:"#607890",fontSize:13}}>İl, ilçe ve mahalle bazlı doğrulanmış piyasa kayıtlarını tek merkezden yönetin.</p></header><AdminStatistics stats={stats}/><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><CsvImportPanel onImport={onImport}/><a href="/templates/market-data-import-template.csv" download style={{padding:"10px 14px",borderRadius:10,border:"1px solid #9db5cb",background:"#f7fbff",fontWeight:800,fontSize:12,color:"#294864",textDecoration:"none"}}>CSV Şablonunu İndir</a></div><DataManagementPanel onSave={onSave}/><AiDataInspector records={records}/><VerificationTable records={records} onStatusChange={onStatusChange}/></section>; }

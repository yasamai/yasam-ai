"use client";
import type { DataCenterStats } from "../../../lib/data-center/types";
export default function AdminStatistics({ stats }: { stats: DataCenterStats }) {
  const cards = [["Toplam Kayıt",stats.totalRecords],["Doğrulandı",stats.verifiedRecords],["İnceleniyor",stats.reviewRecords],["İl",stats.cityCount],["İlçe",stats.districtCount],["Mahalle",stats.neighborhoodCount],["Ortalama Güven",`%${stats.averageConfidence}`]];
  return <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:10}}>{cards.map(([label,value])=><div key={String(label)} style={{padding:14,border:"1px solid #d7e3f0",borderRadius:14,background:"#fff"}}><span style={{fontSize:11,color:"#668099",fontWeight:800}}>{label}</span><strong style={{display:"block",fontSize:24,color:"#153a65",marginTop:5}}>{value}</strong></div>)}</div>;
}

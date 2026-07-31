type PremiumCardProps = { compact?: boolean };
export default function PremiumCard({ compact = false }: PremiumCardProps) {
  return <section style={{ background:"linear-gradient(135deg,#102f52,#071a31)",color:"white",padding:compact?18:26,borderRadius:18,border:"1px solid #c7a955",boxShadow:"0 16px 40px rgba(7,26,49,.18)",marginBottom:20 }}>
    <div style={{ color:"#e5c66f",fontWeight:900,letterSpacing:1.5,fontSize:13 }}>YAŞAM AI PREMIUM</div>
    <h2 style={{ margin:"8px 0",fontSize:compact?20:25 }}>Karar vermeden önce bütün resmi görün.</h2>
    <p style={{ margin:0,color:"#d9e4ef",lineHeight:1.55 }}>Değerleme, risk, fırsat, likidite, rapor geçmişi ve pazarlık stratejisi tek merkezde.</p>
  </section>;
}

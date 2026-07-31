import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: { default: "Yaşam AI", template: "%s | Yaşam AI" }, description: "Türkiye'nin güvenilir gayrimenkul karar platformu." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="tr"><body>{children}</body></html>; }

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "知班 · 班主任工作平台",
  description: "班主任的日常工作、周程、学生关爱、事件档案与工作总结。",
  icons: {
    icon: "/teacher-mark.svg",
    shortcut: "/teacher-mark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}

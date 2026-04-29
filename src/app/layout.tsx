import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';

export const metadata: Metadata = {
  title: 'DrawRace',
  description: 'AI가 그림을 판별하는 실시간 그림 대결 게임',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen text-slate-100 antialiased">
        <Header />
        {children}
      </body>
    </html>
  );
}
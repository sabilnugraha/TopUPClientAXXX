import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TopUp Leave – APLL Test',
  description: 'Testing dashboard for fn_daily_topup_leave_apll',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <header className="bg-blue-700 text-white px-6 py-4 shadow">
          <h1 className="text-xl font-bold tracking-tight">TopUp Leave — APLL</h1>
          <p className="text-blue-200 text-sm">Testing dashboard · fn_daily_topup_leave_apll</p>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}

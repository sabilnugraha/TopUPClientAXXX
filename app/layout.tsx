import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TopUp Leave — APLL',
  description: 'Leave management testing dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-[#f5f5f7] text-gray-900 min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}

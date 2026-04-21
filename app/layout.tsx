import type { Metadata } from 'next';
import './globals.css';
import Sidebar from './components/layout/Sidebar';

export const metadata: Metadata = {
  title: 'Kiro Analytics Dashboard',
  icons: { icon: '/kiro-logo.svg' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="flex">
          <Sidebar />
          <main className="ml-[220px] p-6 min-h-screen w-full">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import Sidebar from './components/layout/Sidebar';
import FloatingChat from './components/chat/FloatingChat';
import { I18nProvider } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/theme';

// NanumSquareOTF web build (OFL-licensed), self-hosted so the dashboard has
// no runtime CDN dependency behind CloudFront. NanumSquare ships 4 weights;
// Tailwind's font-semibold (600) resolves to the 700 face per CSS matching.
const nanumSquare = localFont({
  src: [
    { path: './fonts/NanumSquareL.woff2', weight: '300', style: 'normal' },
    { path: './fonts/NanumSquareR.woff2', weight: '400', style: 'normal' },
    { path: './fonts/NanumSquareB.woff2', weight: '700', style: 'normal' },
    { path: './fonts/NanumSquareEB.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-nanum-square',
  display: 'swap',
});

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
    // suppressHydrationWarning: the inline script below may add the `light`
    // class before React hydrates — that mismatch is intentional (no-FOUC).
    <html lang="ko" className={nanumSquare.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('kiro-theme')==='light')document.documentElement.classList.add('light')}catch(e){}",
          }}
        />
      </head>
      <body className="antialiased">
        <I18nProvider>
          <ThemeProvider>
            <div className="flex">
              <Sidebar />
              {/* Mobile: no sidebar margin, room for the fixed top bar instead */}
              <main className="ml-0 md:ml-[220px] p-4 pt-16 md:p-6 md:pt-6 min-h-screen w-full">
                {children}
              </main>
            </div>
            <FloatingChat />
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

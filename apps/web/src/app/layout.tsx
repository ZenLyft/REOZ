import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0369a1',
};

export const metadata: Metadata = {
  title: 'ZenLyft Revenue Engine',
  description: 'Internal B2B pipeline, lead qualification, and proposal platform for ZenLyft.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ZenLyft Engine',
  },
  icons: {
    apple: '/icon-192.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${inter.className} antialiased selection:bg-sky-100 selection:text-sky-900`}>
        {children}
      </body>
    </html>
  );
}

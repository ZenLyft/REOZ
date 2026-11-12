import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'REOZ — ZenLyft Revenue Engine',
  description:
    'Autonomous Global Client Acquisition & Revenue Operations Platform for ZenLyft Technologies.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'REOZ',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#F5F6F8',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} min-h-screen bg-[#F5F6F8] text-[#151B2B] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}

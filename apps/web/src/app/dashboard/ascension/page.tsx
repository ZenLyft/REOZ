import { Suspense } from 'react';
import AscensionClient from './AscensionClient';

export const metadata = {
  title: 'Global Client Finder — ZenLyft Revenue Engine',
};

export default function AscensionPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-[#525A6B]">Loading Global Client Finder...</div>
      }
    >
      <AscensionClient />
    </Suspense>
  );
}

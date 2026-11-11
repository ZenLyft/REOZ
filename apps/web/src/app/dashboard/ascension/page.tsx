import { Suspense } from 'react';
import AscensionClient from './AscensionClient';

export const metadata = {
  title: 'ZenLyft Ascension — 59-Agent Cloud Control Plane',
};

export default function AscensionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400">Loading ZenLyft Ascension Control Plane...</div>}>
      <AscensionClient />
    </Suspense>
  );
}


import { WhatsAppClient } from './WhatsAppClient';

export const dynamic = 'force-dynamic';

export default function WhatsAppPage() {
  return (
    <div className="space-y-6">
      <WhatsAppClient />
    </div>
  );
}

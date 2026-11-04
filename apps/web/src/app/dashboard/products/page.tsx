import { ProductsClient } from './ProductsClient';

export const dynamic = 'force-dynamic';

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Central Product & Service Catalogue
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Commercial source of truth for AI agents (SDR, AE, Negotiation, Closing, Customer Success).
          Agents can only sell approved packages within configured pricing floors and deliverable scopes.
        </p>
      </div>

      <ProductsClient />
    </div>
  );
}

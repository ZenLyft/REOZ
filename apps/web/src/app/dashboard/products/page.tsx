import { createClient } from '@/lib/supabase/server';
import { ZENLYFT_PRODUCT_CATALOGUE, ProductCatalogueItem } from '@/lib/crm/products';
import { ProductsClient } from './ProductsClient';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const supabase = createClient();
  const { data: dbProducts } = await supabase.from('products').select('id, is_active');

  const activeMap = new Map((dbProducts || []).map((r) => [r.id, Boolean(r.is_active)]));
  const initialProducts: ProductCatalogueItem[] = ZENLYFT_PRODUCT_CATALOGUE.map((p) =>
    activeMap.has(p.id) ? { ...p, is_active: activeMap.get(p.id)! } : p
  );

  return (
    <div className="space-y-6">
      <div className="border-b border-[#E4E7EC] pb-5">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#151B2B]">
          Central Product & Service Catalogue
        </h1>
        <p className="mt-1 text-sm text-[#525A6B]">
          Commercial source of truth backed by Supabase `products`. Active toggles persist across all agent drafts.
        </p>
      </div>

      <ProductsClient initialProducts={initialProducts} />
    </div>
  );
}

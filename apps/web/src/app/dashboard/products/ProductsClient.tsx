'use client';

import { useState } from 'react';
import { ProductCatalogueItem } from '@/lib/crm/products';

export function ProductsClient({ initialProducts }: { initialProducts: ProductCatalogueItem[] }) {
  const [products, setProducts] = useState<ProductCatalogueItem[]>(initialProducts);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: `All Packages (${products.length})` },
    { id: 'education_technology', label: 'Education Tech' },
    { id: 'website_development', label: 'Website Dev' },
    { id: 'ai_automation', label: 'AI & Automation' },
    { id: 'custom_software', label: 'Custom Software' },
    { id: 'technical_services', label: 'Technical Services' },
  ];

  const filtered = products.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesQuery =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.target_customer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  async function toggleProductStatus(item: ProductCatalogueItem) {
    const nextActive = !item.is_active;
    setUpdatingId(item.id);
    try {
      const res = await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, is_active: nextActive }),
      });
      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, is_active: nextActive } : p))
        );
      }
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                selectedCategory === cat.id
                  ? 'bg-[#11100E] border-[#11100E] text-[#FAF6EE]'
                  : 'bg-[#FFFDF9] border-[#DDD4C4] text-[#5A554C] hover:bg-[#EFE7DA] hover:text-[#11100E]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search products or customers..."
          className="rounded-xl border border-[#DDD4C4] bg-[#FFFDF9] px-3.5 py-2 text-xs text-[#11100E] placeholder-[#7C756A] focus:border-[#11100E] focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((item) => {
          const isExpanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              className={`rounded-2xl border p-5 shadow-sm transition ${
                item.is_active
                  ? 'border-[#E5DDD0] bg-[#FFFDF9]'
                  : 'border-[#E5DDD0] bg-[#F4EEE3] opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-block rounded-full border border-[#DDD4C4] bg-[#FAF6EE] px-2.5 py-0.5 text-[10px] font-bold text-[#8C6A3B] uppercase tracking-wider">
                    {item.category_label}
                  </span>
                  <h3 className="mt-1.5 text-base font-bold text-[#11100E]">{item.name}</h3>
                  <p className="mt-1 text-xs text-[#5A554C] line-clamp-2">{item.description}</p>
                </div>

                <button
                  type="button"
                  disabled={updatingId === item.id}
                  onClick={() => toggleProductStatus(item)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold border ${
                    item.is_active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-[#DDD4C4] bg-[#FAF6EE] text-[#5A554C]'
                  }`}
                >
                  {updatingId === item.id ? 'Saving...' : item.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-[#E5DDD0] bg-[#FAF6EE] p-3 text-center">
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#7C756A]">List Price</div>
                  <div className="mt-0.5 text-sm font-black text-[#11100E]">
                    ₹{item.recommended_price_inr.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#7C756A]">Floor Price</div>
                  <div className="mt-0.5 text-sm font-black text-[#8C6A3B]">
                    ₹{item.minimum_approved_price_inr.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#7C756A]">Max Discount</div>
                  <div className="mt-0.5 text-sm font-black text-[#11100E]">
                    {item.maximum_approved_discount_percent}%
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-[#5A554C]">
                <span>Target: {item.target_customer}</span>
                <span>{item.implementation_time_days} days delivery</span>
              </div>

              {isExpanded && (
                <div className="mt-4 space-y-3 border-t border-[#EFE7DA] pt-3 text-xs">
                  <div>
                    <h4 className="font-bold text-[#11100E]">Deliverables Included:</h4>
                    <ul className="mt-1 list-disc list-inside space-y-0.5 text-[#5A554C]">
                      {item.deliverables.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#11100E]">Payment Terms:</h4>
                    <p className="mt-0.5 text-[#5A554C]">{item.payment_terms}</p>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#11100E]">Maintenance Options:</h4>
                    <p className="mt-0.5 text-[#5A554C]">{item.maintenance_options}</p>
                  </div>

                  {item.faqs.length > 0 && (
                    <div>
                      <h4 className="font-bold text-[#11100E]">Approved FAQs:</h4>
                      {item.faqs.map((faq, i) => (
                        <div
                          key={i}
                          className="mt-1 rounded-lg bg-[#FAF6EE] border border-[#E5DDD0] p-2 text-[#5A554C]"
                        >
                          <p className="font-bold text-[#11100E]">Q: {faq.q}</p>
                          <p className="mt-0.5">A: {faq.a}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className="mt-4 w-full rounded-xl border border-[#E5DDD0] bg-[#FAF6EE] py-1.5 text-center text-xs font-bold text-[#5A554C] hover:bg-[#EFE7DA] hover:text-[#11100E]"
              >
                {isExpanded ? 'Hide Details ▲' : 'View Deliverables & Rules ▼'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

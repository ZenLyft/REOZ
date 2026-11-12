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
                  ? 'bg-[#151B2B] border-[#FF6B35] text-[#F5F6F8]'
                  : 'bg-[#FFFFFF] border-[#D0D5DD] text-[#525A6B] hover:bg-[#ECEFF3] hover:text-[#151B2B]'
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
          className="rounded-xl border border-[#D0D5DD] bg-[#FFFFFF] px-3.5 py-2 text-xs text-[#151B2B] placeholder-[#667085] focus:border-[#151B2B] focus:outline-none"
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
                  ? 'border-[#E4E7EC] bg-[#FFFFFF]'
                  : 'border-[#E4E7EC] bg-[#ECEFF3] opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-block rounded-full border border-[#FFCBB8] bg-[#FFF1EC] px-2.5 py-0.5 text-[10px] font-bold text-[#E05220] uppercase tracking-wider">
                    {item.category_label}
                  </span>
                  <h3 className="mt-1.5 text-base font-bold text-[#151B2B]">{item.name}</h3>
                  <p className="mt-1 text-xs text-[#525A6B] line-clamp-2">{item.description}</p>
                </div>

                <button
                  type="button"
                  disabled={updatingId === item.id}
                  onClick={() => toggleProductStatus(item)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold border ${
                    item.is_active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-[#D0D5DD] bg-[#F5F6F8] text-[#525A6B]'
                  }`}
                >
                  {updatingId === item.id ? 'Saving...' : item.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] p-3 text-center">
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#667085]">List Price</div>
                  <div className="mt-0.5 text-sm font-black text-[#151B2B]">
                    ₹{item.recommended_price_inr.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#667085]">Floor Price</div>
                  <div className="mt-0.5 text-sm font-black text-[#FF6B35]">
                    ₹{item.minimum_approved_price_inr.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#667085]">Max Discount</div>
                  <div className="mt-0.5 text-sm font-black text-[#151B2B]">
                    {item.maximum_approved_discount_percent}%
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-[#525A6B]">
                <span>Target: {item.target_customer}</span>
                <span>{item.implementation_time_days} days delivery</span>
              </div>

              {isExpanded && (
                <div className="mt-4 space-y-3 border-t border-[#ECEFF3] pt-3 text-xs">
                  <div>
                    <h4 className="font-bold text-[#151B2B]">Deliverables Included:</h4>
                    <ul className="mt-1 list-disc list-inside space-y-0.5 text-[#525A6B]">
                      {item.deliverables.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#151B2B]">Payment Terms:</h4>
                    <p className="mt-0.5 text-[#525A6B]">{item.payment_terms}</p>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#151B2B]">Maintenance Options:</h4>
                    <p className="mt-0.5 text-[#525A6B]">{item.maintenance_options}</p>
                  </div>

                  {item.faqs.length > 0 && (
                    <div>
                      <h4 className="font-bold text-[#151B2B]">Approved FAQs:</h4>
                      {item.faqs.map((faq, i) => (
                        <div
                          key={i}
                          className="mt-1 rounded-lg bg-[#F5F6F8] border border-[#E4E7EC] p-2 text-[#525A6B]"
                        >
                          <p className="font-bold text-[#151B2B]">Q: {faq.q}</p>
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
                className="mt-4 w-full rounded-xl border border-[#E4E7EC] bg-[#F5F6F8] py-1.5 text-center text-xs font-bold text-[#525A6B] hover:bg-[#ECEFF3] hover:text-[#151B2B]"
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

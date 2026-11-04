'use client';

import { useState } from 'react';
import { ProductCatalogueItem, ZENLYFT_PRODUCT_CATALOGUE } from '@/lib/crm/products';

export function ProductsClient() {
  const [products, setProducts] = useState<ProductCatalogueItem[]>([...ZENLYFT_PRODUCT_CATALOGUE]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: 'All Products (6)' },
    { id: 'education_technology', label: '🎓 Education Tech' },
    { id: 'website_development', label: '🌐 Website Development' },
    { id: 'ai_automation', label: '🤖 AI & Automation' },
    { id: 'custom_software', label: '⚡ Custom Software' },
    { id: 'technical_services', label: '🛠️ Technical Services' },
  ];

  const filtered = products.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    const matchesQuery =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.target_customer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  function toggleProductStatus(id: string) {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, is_active: !p.is_active } : p))
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Category Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-700/60'
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
          placeholder="Search products, problems, tech..."
          className="rounded-xl border border-zinc-800 bg-zinc-900/90 px-3.5 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      {/* Product Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((item) => {
          const isExpanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              className={`rounded-2xl border transition-all ${
                item.is_active
                  ? 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-700'
                  : 'border-zinc-800/60 bg-zinc-950/40 opacity-60'
              } p-5 shadow-sm`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="inline-block rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                    {item.category_label}
                  </span>
                  <h3 className="mt-1.5 text-base font-bold text-zinc-100">{item.name}</h3>
                  <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{item.description}</p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleProductStatus(item.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                    item.is_active
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-zinc-700 bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {item.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>

              {/* Commercial Floor & Price */}
              <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3 text-center">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-zinc-500">List Price</div>
                  <div className="mt-0.5 text-sm font-bold text-zinc-100">
                    ₹{item.recommended_price_inr.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-zinc-500">Min Approved</div>
                  <div className="mt-0.5 text-sm font-bold text-indigo-400">
                    ₹{item.minimum_approved_price_inr.toLocaleString('en-IN')}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-zinc-500">Max Discount</div>
                  <div className="mt-0.5 text-sm font-bold text-amber-400">
                    {item.maximum_approved_discount_percent}%
                  </div>
                </div>
              </div>

              {/* Target Customer & Timeline */}
              <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400">
                <span>🎯 {item.target_customer}</span>
                <span>⏱️ {item.implementation_time_days} days delivery</span>
              </div>

              {/* Collapsible Details */}
              {isExpanded && (
                <div className="mt-4 space-y-3 border-t border-zinc-800/80 pt-3 text-xs">
                  <div>
                    <h4 className="font-semibold text-zinc-300">Deliverables Included:</h4>
                    <ul className="mt-1 list-disc list-inside space-y-0.5 text-zinc-400">
                      {item.deliverables.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-semibold text-zinc-300">Payment Terms:</h4>
                    <p className="mt-0.5 text-zinc-400">{item.payment_terms}</p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-zinc-300">Maintenance Options:</h4>
                    <p className="mt-0.5 text-zinc-400">{item.maintenance_options}</p>
                  </div>

                  {item.faqs.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-zinc-300">Approved FAQs:</h4>
                      {item.faqs.map((faq, i) => (
                        <div key={i} className="mt-1 rounded-lg bg-zinc-950 p-2 text-zinc-400">
                          <p className="font-medium text-zinc-200">Q: {faq.q}</p>
                          <p className="mt-0.5 text-zinc-400">A: {faq.a}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Toggle Expand Button */}
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className="mt-4 w-full rounded-xl border border-zinc-800 bg-zinc-800/40 py-1.5 text-center text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                {isExpanded ? '▲ Hide Commercial Details' : '▼ View Full Deliverables & Rules'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { createLeadAction } from './actions';
import { LeadCreateInput } from '@/lib/crm/leads';

interface CreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeadCreated: () => void;
}

export function CreateLeadModal({ isOpen, onClose, onLeadCreated }: CreateLeadModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<LeadCreateInput>({
    organisation_name: '',
    organisation_type: 'institution',
    category: '',
    location: '',
    website_url: '',
    website_status: 'not_enough_evidence',
    status_evidence_note: '',
    service_interest: 'HOMS & Digital Transformation',
    public_phone: '',
    public_email: '',
    source_url: '',
    next_action: 'Initial audit & outreach',
    next_follow_up: '',
    contact_restriction: 'none',
  });

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await createLeadAction(form);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to create lead');
      return;
    }

    onLeadCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#151B2B]/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#D0D5DD] bg-[#FFFFFF] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#ECEFF3] pb-4">
          <h2 className="text-lg font-black text-[#151B2B]">Add New Prospect</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-[#525A6B] hover:bg-[#ECEFF3] hover:text-[#151B2B]"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#151B2B]">
              Organisation / Institution Name *
            </label>
            <input
              type="text"
              required
              value={form.organisation_name}
              onChange={(e) => setForm({ ...form, organisation_name: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3.5 py-2.5 text-sm text-[#151B2B] focus:border-[#151B2B] focus:outline-none"
              placeholder="e.g. Regent College & Hostel"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#151B2B]">Type</label>
              <select
                value={form.organisation_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    organisation_type: e.target.value as 'local_business' | 'institution',
                  })
                }
                className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3 py-2.5 text-sm text-[#151B2B]"
              >
                <option value="institution">Institution (HOMS/ERP)</option>
                <option value="local_business">Local Business</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#151B2B]">Category *</label>
              <input
                type="text"
                required
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3.5 py-2.5 text-sm text-[#151B2B]"
                placeholder="e.g. College, Hostel, Clinic"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#151B2B]">Location (City, Country) *</label>
            <input
              type="text"
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3.5 py-2.5 text-sm text-[#151B2B]"
              placeholder="e.g. London, UK or Bengaluru, India"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#151B2B]">Website URL</label>
            <input
              type="url"
              value={form.website_url}
              onChange={(e) => setForm({ ...form, website_url: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3.5 py-2.5 text-sm text-[#151B2B]"
              placeholder="https://example.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#151B2B]">Website Status *</label>
              <select
                value={form.website_status}
                onChange={(e) => setForm({ ...form, website_status: e.target.value as any })}
                className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3 py-2.5 text-sm text-[#151B2B]"
              >
                <option value="not_enough_evidence">Not Enough Evidence</option>
                <option value="not_found_in_checked_sources">Not Found in Checked Sources</option>
                <option value="verified">Verified Working</option>
                <option value="appears_outdated">Appears Outdated</option>
                <option value="unavailable_at_check">Unavailable at Check</option>
                <option value="needs_review">Needs Review</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[#151B2B]">Contact Restriction</label>
              <select
                value={form.contact_restriction}
                onChange={(e) => setForm({ ...form, contact_restriction: e.target.value as any })}
                className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3 py-2.5 text-sm text-[#151B2B]"
              >
                <option value="none">None (Standard)</option>
                <option value="do_not_contact">Do Not Contact (DNC)</option>
                <option value="opt_out">Opted Out</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#151B2B]">Evidence Note *</label>
            <input
              type="text"
              required
              value={form.status_evidence_note}
              onChange={(e) => setForm({ ...form, status_evidence_note: e.target.value })}
              className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3.5 py-2.5 text-sm text-[#151B2B]"
              placeholder="e.g. Checked OpenStreetMap & Google Maps; paper outpass desk"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#151B2B]">Public Phone</label>
              <input
                type="text"
                value={form.public_phone}
                onChange={(e) => setForm({ ...form, public_phone: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3.5 py-2.5 text-sm text-[#151B2B]"
                placeholder="+44 20 7946 0000"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#151B2B]">Public Email</label>
              <input
                type="email"
                value={form.public_email}
                onChange={(e) => setForm({ ...form, public_email: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#D0D5DD] bg-[#F5F6F8] px-3.5 py-2.5 text-sm text-[#151B2B]"
                placeholder="admissions@college.edu"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#D0D5DD] px-4 py-2.5 text-sm font-bold text-[#525A6B] hover:bg-[#ECEFF3]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-[#FF6B35] px-5 py-2.5 text-sm font-bold text-[#F5F6F8] hover:bg-[#E05220] disabled:opacity-50"
            >
              {loading ? 'Adding...' : 'Save Prospect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

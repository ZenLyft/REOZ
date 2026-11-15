'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function InviteRedemptionPage({
  params,
}: {
  params: { token: string };
}) {
  const router = useRouter();
  const token = params.token;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/team/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          fullName,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/login');
        }, 2500);
      } else {
        setError(data.error || 'Failed to activate invitation.');
      }
    } catch {
      setError('Network error activating your account.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-[#151B2B] text-white font-black text-xl flex items-center justify-center mx-auto shadow-md border-b-2 border-[#FF6B35]">
          R
        </div>
        <h1 className="text-2xl font-black text-[#151B2B] tracking-tight">
          Join the ZenLyft Team
        </h1>
        <p className="text-xs text-[#525A6B]">
          Activate your verified team workspace account on REOZ.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#FFFFFF] py-8 px-6 shadow-sm border border-[#E4E7EC] sm:rounded-2xl sm:px-10 space-y-4">
          {success ? (
            <div className="text-center space-y-3 py-4">
              <span className="text-4xl">🎉</span>
              <h2 className="text-base font-bold text-[#151B2B]">Account Activated!</h2>
              <p className="text-xs text-[#525A6B]">
                Your account has been created. Redirecting to login...
              </p>
              <Link
                href="/login"
                className="inline-block mt-2 px-4 py-2 text-xs font-bold bg-[#151B2B] text-white rounded-xl"
              >
                Go to Sign In &rarr;
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 font-medium">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#151B2B] mb-1">
                  Full Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Your Full Name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#D0D5DD] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#151B2B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#151B2B] mb-1">
                  Create Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#D0D5DD] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#151B2B]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#151B2B] mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="Repeat your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#D0D5DD] rounded-xl focus:outline-none focus:ring-1 focus:ring-[#151B2B]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 bg-[#151B2B] hover:bg-[#2B313C] text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Activating Account...' : 'Activate My Account'}
              </button>

              <div className="text-center pt-2">
                <Link href="/login" className="text-xs font-medium text-[#525A6B] hover:text-[#151B2B]">
                  Already have an account? Sign in &rarr;
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}


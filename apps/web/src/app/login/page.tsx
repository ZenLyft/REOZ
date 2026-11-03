import { Metadata } from 'next';
import LoginForm from './LoginForm';

export const metadata: Metadata = {
  title: 'Founder Sign In | ZenLyft Revenue Engine',
  description: 'Internal authentication for ZenLyft founder and authorized operators.',
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { returnUrl?: string; message?: string };
}) {
  return (
    <main className="min-h-screen flex flex-col justify-center items-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-sky-600 text-white font-bold text-2xl shadow-sm">
            Z
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            ZenLyft Revenue Engine
          </h1>
          <p className="text-sm text-slate-500">
            Internal Operating Platform • Founder Sign In
          </p>
        </div>

        {/* Security / Context Banner */}
        <div className="rounded-lg bg-sky-50 border border-sky-200 p-3.5 text-xs text-sky-800 flex items-start gap-2">
          <svg
            className="w-4 h-4 text-sky-600 mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          <div>
            <span className="font-semibold">Protected Environment:</span> Restricted to authorized ZenLyft operators. All authentication attempts and actions are immutably logged.
          </div>
        </div>

        {/* Login Form Component */}
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10">
          <LoginForm returnUrl={searchParams.returnUrl} />
        </div>

        {/* Mobile PWA tip */}
        <div className="text-center">
          <p className="text-xs text-slate-400">
            Tip: On iPhone Safari, tap <span className="font-medium text-slate-600">Share</span> → <span className="font-medium text-slate-600">Add to Home Screen</span> for the app experience.
          </p>
        </div>
      </div>
    </main>
  );
}

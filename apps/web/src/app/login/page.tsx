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
    <main className="min-h-screen bg-[#F5F6F8] text-[#151B2B] flex flex-col justify-center items-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#151B2B] text-[#F5F6F8] font-black text-2xl shadow-md border-b-4 border-[#FF6B35]">
            R
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[#151B2B]">
            ZenLyft Revenue Engine
          </h1>
          <p className="text-sm text-[#525A6B]">
            Global Client Acquisition & Operations • Founder Sign In
          </p>
        </div>

        {/* Security Notice */}
        <div className="rounded-xl bg-[#ECEFF3] border border-[#E4E7EC] p-3.5 text-xs text-[#525A6B] flex items-start gap-2.5">
          <svg
            className="w-4 h-4 text-[#151B2B] mt-0.5 shrink-0"
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
            <span className="font-bold text-[#151B2B]">Protected Environment:</span> Restricted to
            authorized ZenLyft operators. All sessions and actions are audit-logged.
          </div>
        </div>

        {/* Login Form */}
        <div className="bg-[#FFFFFF] py-8 px-6 shadow-sm border border-[#E4E7EC] rounded-2xl sm:px-10">
          <LoginForm returnUrl={searchParams.returnUrl} />
        </div>
      </div>
    </main>
  );
}

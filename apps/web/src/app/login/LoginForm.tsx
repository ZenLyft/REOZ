'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { loginAction, type LoginActionState } from './actions';

function SubmitButton({ lockedOut }: { lockedOut?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || lockedOut}
      className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-[#F5F6F8] bg-[#FF6B35] hover:bg-[#E05220] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#FF6B35] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {pending ? 'Authenticating...' : 'Sign In to Dashboard'}
    </button>
  );
}

export default function LoginForm({ returnUrl }: { returnUrl?: string }) {
  const initialState: LoginActionState = {};
  const [state, formAction] = useFormState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="returnUrl" value={returnUrl || '/dashboard'} />

      {state.error && (
        <div
          role="alert"
          className={`p-3.5 rounded-xl text-sm border ${state.lockedOut
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
        >
          <div className="font-bold">
            {state.lockedOut ? 'Account Access Restricted' : 'Authentication Notice'}
          </div>
          <p className="mt-1 text-xs">{state.error}</p>
        </div>
      )}

      <div>
        <label
          htmlFor="email"
          className="block text-xs font-bold uppercase tracking-wider text-[#525A6B]"
        >
          Founder Email
        </label>
        <div className="mt-1.5">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="niresh@zenlyft.in"
            className="appearance-none block w-full px-3.5 py-2.5 border border-[#D0D5DD] bg-[#F5F6F8] text-[#151B2B] rounded-xl placeholder-[#667085] focus:outline-none focus:ring-1 focus:ring-[#151B2B] focus:border-[#151B2B] text-sm"
          />
        </div>
        {state.fieldErrors?.email && (
          <p className="mt-1 text-xs text-red-700">{state.fieldErrors.email[0]}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-xs font-bold uppercase tracking-wider text-[#525A6B]"
        >
          Password
        </label>
        <div className="mt-1.5">
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••••••"
            className="appearance-none block w-full px-3.5 py-2.5 border border-[#D0D5DD] bg-[#F5F6F8] text-[#151B2B] rounded-xl placeholder-[#667085] focus:outline-none focus:ring-1 focus:ring-[#151B2B] focus:border-[#151B2B] text-sm"
          />
        </div>
        {state.fieldErrors?.password && (
          <p className="mt-1 text-xs text-red-700">{state.fieldErrors.password[0]}</p>
        )}
      </div>

      <div className="pt-2">
        <SubmitButton lockedOut={state.lockedOut} />
      </div>
    </form>
  );
}

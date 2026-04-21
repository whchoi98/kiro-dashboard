'use client';

import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-dashboard-bg flex items-center justify-center">
      <div className="bg-dashboard-card border border-dashboard-border rounded-2xl p-10 flex flex-col items-center gap-6 w-full max-w-sm shadow-2xl">
        {/* Kiro SVG Icon */}
        <svg
          width="64"
          height="64"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect rx="16" width="100" height="100" fill="#f97316" />
          <path
            d="M30 70V30h10v16l16-16h13L51 48l20 22H57L42 54v16H30z"
            fill="white"
          />
        </svg>

        {/* Heading */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Kiro Analytics</h1>
          <p className="text-slate-400 mt-1 text-sm">
            Sign in to access the dashboard
          </p>
        </div>

        {/* Sign-in button */}
        <button
          onClick={() => signIn('cognito', { callbackUrl: '/' })}
          className="w-full bg-kiro-orange hover:bg-kiro-orange-dark text-white font-semibold py-2.5 px-6 rounded-lg transition-colors duration-150"
        >
          Sign in with Cognito
        </button>
      </div>
    </div>
  );
}

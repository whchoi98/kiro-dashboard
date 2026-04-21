'use client';

import { signIn } from 'next-auth/react';
import KiroMascot from '@/app/components/ui/KiroMascot';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="bg-[#1a1a1a] border border-[#262626] rounded-2xl p-10 flex flex-col items-center gap-6 w-full max-w-sm shadow-2xl shadow-purple-500/10">
        <KiroMascot size={80} mood="happy" animate={true} />

        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Kiro Analytics</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Sign in to access the dashboard
          </p>
        </div>

        <button
          onClick={() => signIn('cognito', { callbackUrl: '/' })}
          className="w-full bg-[#9046FF] hover:bg-[#7c3aed] text-white font-semibold py-2.5 px-6 rounded-lg transition-colors duration-150 shadow-lg shadow-purple-500/20"
        >
          Sign in with Cognito
        </button>
      </div>
    </div>
  );
}

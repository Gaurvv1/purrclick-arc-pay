import { useState } from 'react'
import CheckoutTab from './components/CheckoutTab'
import ReferralTab from './components/ReferralTab'

type Tab = 'checkout' | 'referral'

export default function App() {
  const [tab, setTab] = useState<Tab>('checkout')

  return (
    <div className="min-h-dvh px-4 py-8 pb-16" style={{ background: 'var(--bg-gradient)' }}>
      <div className="w-full max-w-md mx-auto space-y-5">

        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="display text-2xl font-bold" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            Get Purrclick with USDC
          </h1>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Cute click sounds and a screen recorder for Windows
          </p>
        </div>

        {/* Tab bar */}
        <div
          className="flex rounded-2xl p-1 gap-1"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
        >
          <TabButton active={tab === 'checkout'} onClick={() => setTab('checkout')}>
            Buy
          </TabButton>
          <TabButton active={tab === 'referral'} onClick={() => setTab('referral')}>
            Earn
          </TabButton>
        </div>

        {/* Tab content */}
        {tab === 'checkout' ? <CheckoutTab /> : <ReferralTab />}

      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-xl py-2 text-sm font-semibold transition-all"
      style={{
        background: active ? 'var(--surface-strong)' : 'transparent',
        color: active ? 'var(--ink)' : 'var(--muted)',
        boxShadow: active ? '0 1px 6px rgba(0,0,0,0.25)' : 'none',
      }}
    >
      {children}
    </button>
  )
}


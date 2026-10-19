import { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Copy, Check, ExternalLink, Users } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { parseAbiItem } from 'viem'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { PURRCLICK_PAY, ACTIVE_CHAIN_ID } from '@/lib/purrclick-contract'
import { formatAddress } from '@/lib/utils'

const card: React.CSSProperties = {
  background: 'var(--card-bg)',
  border: '1px solid var(--card-border)',
  borderRadius: '20px',
  boxShadow: '0 2px 20px rgba(0,0,0,0.30)',
}

const inner: React.CSSProperties = {
  background: 'var(--inner-bg)',
  border: '1px solid var(--inner-border)',
  borderRadius: '12px',
}

const PAID_EVENT = parseAbiItem(
  'event Paid(bytes32 indexed orderId, address indexed buyer, address referrer, uint256 amount)',
)

export default function ReferralTab() {
  const { address, isConnected, chainId } = useAccount()
  const wrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID
  const publicClient = usePublicClient({ chainId: ACTIVE_CHAIN_ID })

  const [copied, setCopied] = useState(false)
  const [earnings, setEarnings] = useState<bigint | null>(null)
  const [salesCount, setSalesCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  const refLink = address
    ? `${window.location.origin}${window.location.pathname}?ref=${address}`
    : null

  function copyLink() {
    if (!refLink) return
    void navigator.clipboard.writeText(refLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  useEffect(() => {
    if (!address || !publicClient || wrongChain) return
    let cancelled = false

    async function fetchEarnings() {
      if (!publicClient || !address) return
      setLoading(true)
      try {
        const logs = await publicClient.getLogs({
          address: PURRCLICK_PAY.address,
          event: PAID_EVENT,
          fromBlock: 0n,
          toBlock: 'latest',
        })
        if (cancelled) return
        const mine = logs.filter(
          (l) => (l.args.referrer as string)?.toLowerCase() === address.toLowerCase()
        )
        const total = mine.reduce(
          (sum, l) => {
            const refBps = 2000n
            const amt = ((l.args.amount as bigint) * refBps) / 10_000n
            return sum + amt
          },
          0n,
        )
        setSalesCount(mine.length)
        setEarnings(total)
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchEarnings()
    return () => { cancelled = true }
  }, [address, publicClient, wrongChain])

  const earningsFormatted = earnings != null
    ? Amount.fromRaw(earnings, usdcDecimalsFor(ACTIVE_CHAIN_ID)).toFixed(2)
    : null

  return (
    <div className="space-y-3">

      {/* Hero */}
      <div style={card}>
        <div className="px-5 py-4">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="size-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid var(--border)' }}
            >
              <Users className="size-4" style={{ color: 'var(--ink-2)' }} />
            </div>
            <div>
              <p className="display text-base font-bold" style={{ color: 'var(--ink)' }}>Earn with Purrclick</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>20% of every sale through your link</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed mt-1" style={{ color: 'var(--ink-2)' }}>
            Share your link. When someone buys through it, you earn 20% — paid instantly in USDC on-chain.
          </p>
        </div>
      </div>

      {!isConnected ? (
        <div className="px-5 py-6 flex flex-col items-center gap-4 text-center" style={card}>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect your wallet to get your referral link.</p>
          <ConnectKitButton />
        </div>
      ) : wrongChain ? (
        <div className="px-5 py-5 text-center" style={card}>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Switch to Arc Testnet to see your earnings.</p>
        </div>
      ) : (
        <>
          {/* Referral link */}
          <div style={card}>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs font-semibold" style={{ color: 'var(--muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                Your referral link
              </p>
              <div className="flex items-center gap-2 px-3 py-2.5" style={inner}>
                <span className="flex-1 text-xs mono truncate" style={{ color: 'var(--ink-2)' }}>
                  {refLink}
                </span>
                <button
                  onClick={copyLink}
                  className="shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all"
                  style={copied
                    ? { background: 'rgba(62,207,114,0.12)', color: 'var(--success)', border: '1px solid rgba(62,207,114,0.25)', borderRadius: '10px', cursor: 'pointer' }
                    : { background: 'var(--surface-strong)', color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer' }
                  }
                >
                  {copied
                    ? <span className="flex items-center gap-1"><Check className="size-3" />Copied</span>
                    : <span className="flex items-center gap-1"><Copy className="size-3" />Copy</span>
                  }
                </button>
              </div>
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                Anyone who opens this link lands on the checkout with your address as the referrer.
              </p>
            </div>
          </div>

          {/* Earnings */}
          <div style={card}>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs font-semibold" style={{ color: 'var(--muted)', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                Total earned
              </p>
              {loading ? (
                <div className="h-10 rounded-xl animate-pulse" style={{ background: 'var(--surface-muted)' }} />
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="display text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
                    ${earningsFormatted ?? '0.00'}
                  </span>
                  <div className="flex items-center gap-1">
                    <TokenUSDC variant="branded" size={16} />
                    <span className="text-sm" style={{ color: 'var(--subtle)' }}>USDC</span>
                  </div>
                </div>
              )}
              {salesCount != null && !loading && (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  From {salesCount} referred {salesCount === 1 ? 'sale' : 'sales'}
                </p>
              )}
              <div className="flex items-center justify-between px-3 py-2" style={inner}>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Your wallet</span>
                <span className="mono text-xs" style={{ color: 'var(--ink-2)' }}>
                  {formatAddress(address!)}
                </span>
              </div>
              <a
                href={`https://explorer.testnet.arc.io/address/${PURRCLICK_PAY.address}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: 'var(--muted)' }}
              >
                View contract on ArcScan <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

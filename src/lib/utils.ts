export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

/** keccak256(email + timestamp) used as orderId — generated entirely client-side */
export async function makeOrderId(email: string, ts: number): Promise<`0x${string}`> {
  const { keccak256, encodePacked } = await import('viem')
  return keccak256(encodePacked(['string', 'uint256'], [email.toLowerCase().trim(), BigInt(ts)]))
}

export function parseOnchainError(error: unknown): string {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('rejected the request')) return 'Cancelled.'
  if (msg.includes('insufficient') || msg.includes('exceeds balance')) return 'Insufficient USDC balance or allowance.'
  if (msg.includes('orderalreadypaid')) return 'This order has already been paid.'
  if (msg.includes('paused') || msg.includes('enforced pause')) return 'Purchases are temporarily paused.'
  if (msg.includes('reverted')) return 'Transaction reverted. Check your USDC balance and allowance.'
  return 'Something went wrong. Please try again.'
}

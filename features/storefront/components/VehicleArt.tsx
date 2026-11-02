/** A drawn vehicle for a ride option: sedan for everyday rides, a taller body for larger groups and
 * accessible service. Tinted per option so the list reads at a glance. */
export function VehicleArt({ kind = 'sedan', tone = 'light', className }: { kind?: 'sedan' | 'suv' | 'van'; tone?: 'light' | 'dark'; className?: string }) {
  const body = tone === 'dark' ? '#1f2629' : '#f4f6f7'
  const shade = tone === 'dark' ? '#0f1416' : '#d7dde0'
  const glass = tone === 'dark' ? '#3b474c' : '#4a5a62'
  const outline = tone === 'dark' ? '#0b0f10' : '#aab4b9'
  const roof = kind === 'sedan'
    ? 'M30 30 C40 18 52 14 70 14 L92 14 C104 14 112 20 122 30 Z'
    : kind === 'suv' ? 'M26 30 L34 12 C36 9 40 8 44 8 L104 8 C110 8 114 11 118 16 L128 30 Z'
    : 'M22 30 L26 8 C27 5 30 4 34 4 L118 4 C124 4 128 8 130 14 L134 30 Z'
  const windows = kind === 'sedan'
    ? 'M40 29 C46 21 54 18 66 18 L74 18 L74 29 Z M78 18 L90 18 C100 18 106 22 113 29 L78 29 Z'
    : kind === 'suv' ? 'M36 29 L42 14 L72 14 L72 29 Z M76 14 L102 14 C106 14 109 16 111 19 L118 29 L76 29 Z'
    : 'M30 29 L33 9 L66 9 L66 29 Z M70 9 L114 9 C119 9 122 12 123 16 L126 29 L70 29 Z'
  return <svg viewBox="0 0 160 64" aria-hidden="true" className={className}>
    <ellipse cx="80" cy="57" rx="70" ry="5" fill="#0b2b2e" opacity="0.16" />
    <path d={roof} fill={body} stroke={outline} strokeWidth="1.2" />
    <path d={windows} fill={glass} opacity="0.9" />
    <path d="M8 46 C8 36 14 31 26 30 L132 30 C146 31 154 36 154 44 L154 48 C154 51 152 52 149 52 L12 52 C9 52 8 50 8 48 Z" fill={body} stroke={outline} strokeWidth="1.2" />
    <path d="M10 44 L152 44" stroke={shade} strokeWidth="3" />
    <path d="M140 35 L152 37" stroke="#f6c453" strokeWidth="3" strokeLinecap="round" />
    <path d="M10 36 L18 35" stroke="#d2554a" strokeWidth="3" strokeLinecap="round" />
    {[38, 122].map(cx => <g key={cx}><circle cx={cx} cy="50" r="10" fill="#14191b" /><circle cx={cx} cy="50" r="5" fill="#c9d0d3" /><circle cx={cx} cy="50" r="2" fill="#6b777c" /></g>)}
  </svg>
}

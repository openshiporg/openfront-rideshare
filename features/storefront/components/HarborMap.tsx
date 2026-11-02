import { useId } from 'react'

/** The storefront's map backdrop: a drawn city plan (water, streets, parks) with the rider's own
 * pickup and destination pinned on it. It carries no live vehicle positions; labels come from the
 * fleet's public city, its service areas and what the rider typed. */
export function HarborMap({ variant = 'home', city, areas = [], pickupLabel, dropoffLabel, className }: {
  variant?: 'home' | 'route'
  city?: string | null
  areas?: string[]
  pickupLabel?: string | null
  dropoffLabel?: string | null
  className?: string
}) {
  const id = useId().replace(/:/g, '')
  const land = 'M0,1000 L0,360 C90,330 210,300 330,262 C430,230 520,170 600,120 C640,96 690,96 720,126 C780,170 900,176 1040,186 C1150,194 1240,214 1310,268 C1380,330 1430,420 1462,520 C1492,620 1510,760 1532,1000 Z'
  const minor: string[] = []
  for (let x = 0; x <= 1600; x += 34) minor.push(`M${x},0V1000`)
  for (let y = 0; y <= 1000; y += 34) minor.push(`M0,${y}H1600`)
  const major: string[] = []
  for (let x = 40; x <= 1600; x += 156) major.push(`M${x},0V1000`)
  for (let y = 70; y <= 1000; y += 132) major.push(`M0,${y}H1600`)
  const parks = [[70, 560, 520, 66], [610, 300, 40, 34], [880, 300, 34, 30], [740, 420, 46, 30], [1000, 560, 52, 40], [1180, 600, 30, 30], [940, 800, 40, 34], [1080, 860, 46, 36], [300, 420, 40, 34], [1240, 420, 28, 26], [560, 720, 120, 70], [180, 760, 54, 40], [1330, 760, 40, 30], [820, 600, 30, 26]]
  const labelAreas = areas.slice(0, 3)
  const areaSpots = [[780, 375], [1290, 383], [1060, 780]]
  const pickup = pickupLabel?.trim()
  const dropoff = dropoffLabel?.trim()
  const route = 'M993,717 L983,636 L1006,632 L996,548 L1086,532 L1088,470 L1108,382 L1215,362 L1215,338'
  return <div aria-hidden="true" className={`[container-type:size] ${className || ''}`}>
    <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className="block size-full select-none">
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bfe3f2" /><stop offset="1" stopColor="#a6d6ec" /></linearGradient>
        <clipPath id={`${id}c`}><path d={land} /></clipPath>
        <radialGradient id={`${id}h`}><stop offset="0" stopColor="#2f6fe0" stopOpacity="0.22" /><stop offset="1" stopColor="#2f6fe0" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1600" height="1000" fill={`url(#${id}w)`} />
      <path d="M1320,0 C1400,120 1480,170 1600,190" fill="none" stroke="#9ccde4" strokeWidth="2" strokeDasharray="6 8" />
      <path d={land} fill="#eceeea" stroke="#d6dfd9" strokeWidth="3" />
      <g clipPath={`url(#${id}c)`}>
        <path d={minor.join('')} stroke="#ffffff" strokeWidth="1.6" opacity="0.9" />
        {parks.map(([x, y, w, h], index) => <rect key={index} x={x} y={y} width={w} height={h} rx="4" fill="#d3ead0" />)}
        <path d={major.join('')} stroke="#ffffff" strokeWidth="4" />
        <path d={major.join('')} stroke="#e4e9e6" strokeWidth="0.8" />
        <path d="M600,140 L1500,860" stroke="#ffffff" strokeWidth="8" />
        <path d="M1410,1000 C1380,860 1360,760 1440,620 C1490,540 1540,480 1600,440" fill="none" stroke="#f3e2a2" strokeWidth="7" />
        <path d="M1110,1000 C1130,900 1150,840 1220,780 C1300,720 1380,690 1480,660" fill="none" stroke="#f3e2a2" strokeWidth="6" />
      </g>
      <path d="M1450,560 L1600,420" stroke="#ffffff" strokeWidth="5" />
      <path d="M1450,560 L1600,420" stroke="#b8c6cc" strokeWidth="1.5" />
      {variant === 'route' && <>
        <path d={route} fill="none" stroke="#ffffff" strokeWidth="9" strokeLinejoin="round" />
        <path d={route} fill="none" stroke="#0e5c5c" strokeWidth="5" strokeLinejoin="round" />
        <circle cx="993" cy="717" r="13" fill="#ffffff" /><circle cx="993" cy="717" r="8" fill="#0b4a4a" />
        <Pin x={1215} y={338} />
      </>}
      {variant === 'home' && <>
        <circle cx="1050" cy="660" r="48" fill={`url(#${id}h)`} />
        <circle cx="1050" cy="660" r="10" fill="#ffffff" /><circle cx="1050" cy="660" r="7" fill="#2f6fe0" />
        {pickup && <>
          <Pin x={1205} y={212} />
        </>}
      </>}
    </svg>
    {/* Labels are HTML so they keep a readable size however the map is cropped. */}
    {city && <MapLabel x={955} y={545} className="text-[1.125rem] font-semibold tracking-[0.08em] text-[#163a3e] max-sm:hidden">{city}</MapLabel>}
    {labelAreas.map((label, index) => <MapLabel key={label} x={areaSpots[index][0]} y={areaSpots[index][1]} className="text-[0.6875rem] font-semibold tracking-[0.06em] text-[#5d6d70] max-lg:hidden">{label}</MapLabel>)}
    {variant === 'route' && <MapChip x={1215} y={287} className="max-lg:hidden">Drop-off</MapChip>}
    {variant === 'route' && dropoff && <MapLabel x={1240} y={332} align="start" className="rounded-md bg-white/85 px-2 py-0.5 text-xs font-semibold text-[#163a3e] max-lg:hidden">{dropoff}</MapLabel>}
    {variant === 'home' && pickup && <MapChip x={1205} y={162} className="max-lg:hidden">{pickup}</MapChip>}
  </div>
}

// The SVG uses "xMidYMid slice", so a viewBox point maps to the box through the cover scale.
// CSS can't read that scale, so position by the same rule: centre plus offset * max(w/1600, h/1000).
function place(x: number, y: number) {
  return { left: `calc(50% + (${x - 800}) * max(100cqw / 1600, 100cqh / 1000))`, top: `calc(50% + (${y - 500}) * max(100cqw / 1600, 100cqh / 1000))` }
}

function MapLabel({ x, y, align = 'center', className, children }: { x: number; y: number; align?: 'center' | 'start'; className?: string; children: React.ReactNode }) {
  return <span style={place(x, y)} className={`pointer-events-none absolute max-w-[14rem] ${align === 'center' ? '-translate-x-1/2' : ''} -translate-y-1/2 truncate whitespace-nowrap ${className || ''}`}>{children}</span>
}

function MapChip({ x, y, className, children }: { x: number; y: number; className?: string; children: React.ReactNode }) {
  return <span style={place(x, y)} className={`pointer-events-none absolute max-w-[12rem] -translate-x-1/2 -translate-y-1/2 truncate whitespace-nowrap rounded-full bg-[#0d3b3e] px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-white ${className || ''}`}>{children}</span>
}


function Pin({ x, y }: { x: number; y: number }) {
  return <g transform={`translate(${x - 13},${y - 34})`}>
    <ellipse cx="13" cy="36" rx="9" ry="3.5" fill="#0b2b2e" opacity="0.18" />
    <path d="M13 0C5.8 0 0 5.6 0 12.6 0 22 13 34 13 34S26 22 26 12.6C26 5.6 20.2 0 13 0Z" fill="#0b4a4a" />
    <circle cx="13" cy="12.5" r="5" fill="#ffffff" />
  </g>
}


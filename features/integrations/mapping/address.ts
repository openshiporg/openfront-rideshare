/**
 * How a Photon (OpenStreetMap) result is written for riders, drivers and the fleet:
 *   an address      → "24123 Narbonne Ave, Lomita"
 *   a named place   → "Alehouse, 24123 Narbonne Ave, Lomita" (name first)
 *   a street only   → "Belle Porte Ave, Los Angeles", or the rider's own house number when they typed one
 * The label is what is saved on the ride, so the receipt and the admin trip pages read the same.
 * Pure and dependency-free so it can be unit tested.
 */

export type PhotonProps = {
  name?: string | null
  housenumber?: string | null
  street?: string | null
  district?: string | null
  locality?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  type?: string | null
  osm_key?: string | null
  osm_value?: string | null
}
export type FormattedPlace = { label: string; name: string; detail: string }

const SUFFIX: Record<string, string> = {
  avenue: 'Ave', boulevard: 'Blvd', street: 'St', road: 'Rd', drive: 'Dr', highway: 'Hwy', lane: 'Ln', place: 'Pl', court: 'Ct',
  parkway: 'Pkwy', terrace: 'Ter', circle: 'Cir', square: 'Sq', trail: 'Trl', expressway: 'Expy', freeway: 'Fwy',
}
const DIRECTION: Record<string, string> = { north: 'N', south: 'S', east: 'E', west: 'W', northeast: 'NE', northwest: 'NW', southeast: 'SE', southwest: 'SW' }
const clean = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

/** "South Normandie Avenue" → "S Normandie Ave"; a lone "Avenue" or "The Strand" stays as it is. */
export function shortStreet(street: string): string {
  const words = clean(street).split(' ').filter(Boolean)
  if (words.length < 2) return words.join(' ')
  const last = words.length - 1
  const out = words.map((word, index) => {
    const key = word.toLowerCase()
    if (index === last && SUFFIX[key]) return SUFFIX[key]
    if ((index === 0 || index === last) && DIRECTION[key] && words.length > 2) return DIRECTION[key]
    return word
  })
  return out.join(' ')
}

/** The town riders use: the city, else the district or locality. */
const townOf = (p: PhotonProps) => clean(p.city) || clean(p.district) || clean(p.locality)

/** A house number the rider typed at the start ("24123 Narbonne Ave" → "24123"), if any. */
export function typedHouseNumber(query: string | null | undefined): string | null {
  const match = clean(query).match(/^(\d{1,6}[a-z]?(?:[-/]\d{1,4}[a-z]?)?)\s+\S/i)
  return match ? match[1] : null
}

const sameStreet = (query: string, street: string) => {
  // The typed text names this street when the street's main word (not "Avenue", "North"…) is in it.
  const words = street.toLowerCase().split(/\s+/).filter(word => !SUFFIX[word] && !DIRECTION[word] && word.length > 1)
  const typed = query.toLowerCase()
  return words.length > 0 && words.every(word => typed.includes(word))
}

export function formatPlace(p: PhotonProps, typed?: string | null): FormattedPlace | null {
  const name = clean(p.name)
  const street = clean(p.street)
  const town = townOf(p)
  const isStreet = p.type === 'street' || p.osm_key === 'highway'
  const housenumber = clean(p.housenumber)
  let line = street && housenumber ? `${housenumber} ${shortStreet(street)}` : street ? shortStreet(street) : ''

  // A street result for a typed address: keep the rider's house number rather than collapse to the street.
  const typedNumber = typedHouseNumber(typed)
  if (isStreet && !housenumber && typedNumber && name && sameStreet(typed || '', name)) line = `${typedNumber} ${shortStreet(name)}`
  else if (!housenumber && typedNumber && street && !name && sameStreet(typed || '', street)) line = `${typedNumber} ${shortStreet(street)}`

  const placeName = isStreet ? '' : name
  // The rider typed this address: the address leads, the business at it follows.
  const addressFirst = Boolean(placeName && housenumber && typedNumber === housenumber)
  let title: string
  let labelRest: string[]
  let detailParts: string[]
  if (placeName && !addressFirst) { title = placeName; labelRest = [line, town]; detailParts = [line, town] }
  else if (line) { title = line; labelRest = [town]; detailParts = [town, placeName] }
  else if (name) { title = isStreet ? shortStreet(name) : name; labelRest = [town]; detailParts = [town] }
  else if (town) { title = town; labelRest = []; detailParts = [clean(p.state)] }
  else return null

  const tidy = (parts: string[]) => parts.filter(Boolean).filter((part, index, all) => part !== title && all.indexOf(part) === index)
  const label = [title, ...tidy(labelRest)].join(', ').slice(0, 160)
  const detail = tidy(detailParts).join(' · ') || clean(p.state)
  return { label, name: title, detail }
}

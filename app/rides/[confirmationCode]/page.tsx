import { notFound } from 'next/navigation'
import RiderApp from '@/features/storefront/screens/RiderApp'

// Ride codes are issued as TRIP-XXXXXXXX; anything else can never be a ride.
export default async function Page({ params, searchParams }: { params: Promise<{ confirmationCode: string }>; searchParams: Promise<{ request?: string }> }) {
  const [{ confirmationCode }, { request }] = await Promise.all([params, searchParams])
  if (!/^TRIP-[A-Z0-9-]{1,40}$/i.test(confirmationCode)) notFound()
  return <RiderApp initialRide={{ code: confirmationCode, requestId: request }} />
}

import RiderApp from '@/features/storefront/screens/RiderApp'
export default async function Page({ params, searchParams }: { params: Promise<{ confirmationCode: string }>; searchParams: Promise<{ request?: string }> }) { const [{ confirmationCode }, { request }] = await Promise.all([params, searchParams]); return <RiderApp initialRide={{ code: confirmationCode, requestId: request }} /> }

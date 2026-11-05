import RiderApp from '@/features/storefront/screens/RiderApp'
export default async function Page({ searchParams }: { searchParams: Promise<{ service?: string }> }) { const { service } = await searchParams; return <RiderApp initialServiceId={service} /> }

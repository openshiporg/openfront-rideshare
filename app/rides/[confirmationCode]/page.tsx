import TripStatusPage from '@/features/storefront/screens/TripStatusPage'
export default async function Page({params,searchParams}:{params:Promise<{confirmationCode:string}>;searchParams:Promise<{request?:string}>}){const [{confirmationCode},{request}]=await Promise.all([params,searchParams]);return <TripStatusPage confirmationCode={confirmationCode} requestId={request}/>}

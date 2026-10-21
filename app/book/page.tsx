import RiderHomePage from '@/features/storefront/screens/RiderHomePage'
export default async function Page({searchParams}:{searchParams:Promise<{service?:string}>}){const {service=''}=await searchParams;return <RiderHomePage initialServiceId={service}/>}

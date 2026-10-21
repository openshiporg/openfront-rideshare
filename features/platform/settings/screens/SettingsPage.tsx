import { FleetBrandingSettings } from '../branding/FleetBrandingSettings'
import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const areas = [
  ['Fleet records','fleets','Tenant identity, ownership, and operator roles.'],['Service records','ride-services','Public offers and coarse service geography.'],['Fare rules','fare-rules','Versioned source-owned pricing in minor units.'],['Policy records','policies','Eligibility requirements and evidence review without compliance claims.'],['Provider connections','provider-connections','Mapping, identity, communications, location, and background-check adapter references.'],['Marketplace','marketplace-registrations','Discovery registration and verification evidence.'],
]
export function SettingsPage(){return <PageContainer title="Settings" header={<div><h1 className="text-2xl font-semibold">Platform settings</h1><p className="text-sm text-muted-foreground">Manage fleet branding and review configuration records.</p></div>} breadcrumbs={[{type:'link',label:'Dashboard',href:'/dashboard'},{type:'page',label:'Settings'}]}><div className="p-4 md:p-6"><FleetBrandingSettings /></div><div className="grid gap-4 p-4 md:grid-cols-2 md:p-6">{areas.map(([title,path,description])=><Link href={`/dashboard/${path}`} key={path}><Card className="h-full hover:bg-muted/40"><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{description}</CardContent></Card></Link>)}</div></PageContainer>}
export default SettingsPage

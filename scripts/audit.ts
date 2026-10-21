import fs from 'node:fs'
import path from 'node:path'

const failures:string[]=[]
const root=process.cwd()
const todoFiles=['features/keystone/models/Todo.ts','features/keystone/models/TodoImage.ts'].filter(file=>fs.existsSync(path.join(root,file)))
if(todoFiles.length)failures.push(`Starter models remain: ${todoFiles.join(', ')}`)
const routes=path.join(root,'app/dashboard/(admin)/platform')
for(const domain of fs.readdirSync(routes)){const file=path.join(routes,domain,'page.tsx');if(fs.existsSync(file)&&fs.readFileSync(file,'utf8').split('\n').length>10)failures.push(`Heavy route wrapper: ${path.relative(root,file)}`)}
for(const file of fs.readdirSync(path.join(root,'features/keystone/models')).filter(file=>file.endsWith('.ts')&&!['index.ts','trackingFields.ts'].includes(file))){const content=fs.readFileSync(path.join(root,'features/keystone/models',file),'utf8');if(!content.includes('...trackingFields'))failures.push(`Missing tracking fields: ${file}`)}
for(const required of ['features/platform/onboarding/components/OnboardingCards.tsx','features/platform/onboarding/components/OnboardingDialog.tsx','features/platform/onboarding/hooks/useOnboardingApi.ts','features/platform/onboarding/lib/seed.json','marketplace/openfront.marketplace.json'])if(!fs.existsSync(path.join(root,required)))failures.push(`Missing required file: ${required}`)
if(failures.length){console.error(failures.join('\n'));process.exit(1)}
console.log('Openfront Rideshare architecture audit passed.')

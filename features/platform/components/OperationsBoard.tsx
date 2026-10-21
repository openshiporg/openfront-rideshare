import Link from 'next/link'
import { PageContainer } from '@/features/dashboard/components/PageContainer'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { OperationalRefresh } from './OperationalRefresh'

export type BoardColumn = { key: string; label: string }
export function OperationsBoard({ title, description, items, columns, empty, render, error, selectedStatus = 'all', queryParams, showColumnCounts = true }: { title: string; description: string; items: any[]; columns: BoardColumn[]; empty: string; render: (item: any) => React.ReactNode; error?: string; selectedStatus?: string; queryParams?: Record<string, string>; showColumnCounts?: boolean }) {
  const activeStatus = columns.some(column => column.key === selectedStatus) ? selectedStatus : 'all'
  const visibleItems = activeStatus === 'all' ? items : items.filter(item => item.status === activeStatus)
  function columnHref(status: string) {
    const params = new URLSearchParams(queryParams)
    params.set('status', status)
    params.set('page', '1')
    return `?${params.toString()}`
  }
  return <PageContainer title={title} header={<div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="text-sm text-muted-foreground">{description}</p></div>} breadcrumbs={[{type:'link',label:'Dashboard',href:'/dashboard'},{type:'page',label:title}]}>
    <div className="space-y-5 p-4 md:p-6"><div className="flex flex-wrap gap-2">{columns.map(column=><Link key={column.key} href={columnHref(column.key)} aria-current={activeStatus === column.key ? 'page' : undefined}><Badge variant="outline" className={`px-3 py-1.5 ${activeStatus === column.key ? 'border-primary bg-primary/10' : ''}`}>{column.label} {showColumnCounts && !error && <span className="ml-1 text-muted-foreground">{items.filter(item=>column.key==='all'||item.status===column.key).length}</span>}</Badge></Link>)}</div>
      <OperationalRefresh revision={new Date().toISOString()} />
      <form className="flex flex-wrap items-end gap-2" role="search"><label className="min-w-0 flex-1 text-sm">Find a record<input name="q" maxLength={100} defaultValue={queryParams?.q || ''} className="mt-1 block h-10 w-full rounded-md border bg-background px-3" placeholder="Reference or name" /></label>{Object.entries({ ...queryParams, status: activeStatus, page: '1' }).filter(([key]) => key !== 'q').map(([key,value]) => <input key={key} type="hidden" name={key} value={value} />)}<button className="rounded-md border px-4 py-2 text-sm" type="submit">Search</button></form>
      {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : visibleItems.length ? <div className="grid gap-3">{visibleItems.map(item=><Card key={item.id}><CardContent className="min-w-0 break-words p-4">{render(item)}</CardContent></Card>)}</div> : <div><EmptyState title={activeStatus === 'all' && !queryParams?.q ? empty : 'No matching records'} description={activeStatus === 'all' && !queryParams?.q ? 'New records will appear here when available.' : 'Try another reference or reset the filters.'} />{(activeStatus !== 'all' || queryParams?.q) && <Link className="block text-center text-sm underline" href="?status=all&page=1">Reset filters</Link>}</div>}
    </div>
  </PageContainer>
}

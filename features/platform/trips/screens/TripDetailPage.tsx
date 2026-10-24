import Link from 'next/link'
import { CarFront, ChevronLeft, Star, UserRound, Users } from 'lucide-react'
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient'
import { PageBreadcrumbs } from '@/features/dashboard/components/PageBreadcrumbs'
import { PlatformEmpty, PlatformHeader, PlatformSection } from '@/features/platform/components/PlatformPage'
import { RouteLine } from '@/features/platform/components/RouteLine'
import { StatusDot, StatusTitle } from '@/features/platform/components/StatusTitle'
import { TripStageRail } from '@/features/platform/components/TripStageRail'
import { CommandRecovery } from '@/features/platform/components/CommandRecovery'
import { statusLabel, statusTone, formatWhen } from '@/features/platform/lib/statusTone'
import { formatMoney } from '@/features/lib/currency'
import { operationsEnabled } from '@/features/keystone/domain/operationalReadiness'
import { IncidentActions, SupportCaseActions } from '@/features/platform/safety/components/CaseActions'
import { TripOperatorActions } from '../components/TripOperatorActions'
import { ConfirmPaymentTrack, ConfirmRefundTrack, MessageComposer, RecordPaymentTrack, RefundSheet } from '../components/TripDetailActions'

const TRIP_QUERY = `query TripDetail($id: ID!) {
  authenticatedItem { ... on User { id } }
  trip(where: { id: $id }) {
    id confirmationCode status scheduledFor acceptedAt enRouteAt arrivedAt startedAt completedAt cancelledAt pickupLabel dropoffLabel bookingSnapshot updatedAt
    acceptedOffer { id }
    fleet { id name currencyCode operationsMode }
    request { id requestNumber passengerCount status }
    rider { id name email }
    driver { id publicName }
    vehicle { id label plateMasked }
    events(orderBy: [{ occurredAt: desc }], take: 50) { id eventType toStatus actorType occurredAt }
    cancellations(take: 10) { id actorType reasonCode reason feeMinor currencyCode refundRequired createdAt }
    payments(take: 10) { id status amountMinor currencyCode createdAt capturedAt provider { code name } refunds(take: 20) { id amountMinor currencyCode status reason createdAt } }
    incidents(take: 10) { id caseNumber status severity summary assignedTo { id } }
    supportCases(take: 10) { id caseNumber status subject assignedTo { id } }
    reviews(take: 5) { id rating body status direction }
    conversation { id status messages(orderBy: [{ createdAt: asc }], take: 100) { id senderType body createdAt } }
  }
}`

const money = (minor: unknown, currency: unknown) => typeof minor === 'number' && typeof currency === 'string' && currency ? formatMoney(minor, currency) : '—'
const eventLabel = (event: any) => event.toStatus ? statusLabel(event.toStatus) : ({ 'trip.message_submitted': 'Message', 'trip.support_submitted': 'Help requested', 'trip.review_submitted': 'Reviewed', 'trip.incident_submitted': 'Safety report' } as Record<string, string>)[event.eventType] || statusLabel(event.eventType.replace(/^trip\./, ''))

export async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const response = await keystoneClient(TRIP_QUERY, { id })
  const trip = response.success ? response.data?.trip : null
  const actorId = response.success ? response.data?.authenticatedItem?.id || '' : ''
  // Same shape finance.ts reads when it records the charge: bookingSnapshot.quote.{totalMinor,currencyCode} or .quote.fare.
  const quote = trip?.bookingSnapshot?.quote || {}
  const totalMinor = typeof (quote.totalMinor ?? quote.fare?.totalMinor) === 'number' ? (quote.totalMinor ?? quote.fare.totalMinor) : null
  const currency = quote.currencyCode || quote.fare?.currencyCode || trip?.fleet?.currencyCode || 'USD'
  const open = trip ? operationsEnabled(trip.fleet?.operationsMode) : false
  const payable = trip && ['driver_assigned', 'driver_en_route', 'driver_arrived', 'in_progress', 'completed'].includes(trip.status)
  return <>
    <PageBreadcrumbs items={[{ type: 'link', label: 'Dashboard', href: '' }, { type: 'link', label: 'Trips', href: '/platform/trips' }, { type: 'page', label: trip?.confirmationCode || 'Trip' }]} />
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4 md:p-6">
      <Link href="/dashboard/platform/trips" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" aria-hidden="true" />Trips</Link>
      {!trip ? <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">Trip not found or outside your access.</p> : <>
        <PlatformHeader
          title={<StatusTitle as="span" tone={statusTone(trip.status)} status={statusLabel(trip.status)} pulse={['driver_en_route', 'in_progress'].includes(trip.status)} className="font-mono">{trip.confirmationCode}</StatusTitle>}
          meta={<>{trip.request && <span className="font-mono">{trip.request.requestNumber}</span>}<span>{trip.scheduledFor ? `Pickup ${formatWhen(trip.scheduledFor)}` : 'On demand'}</span>{totalMinor !== null && <span className="font-semibold text-foreground tabular-nums">{money(totalMinor, currency)}</span>}</>}
        />
        <CommandRecovery actorId={actorId} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-5 rounded-xl border bg-card p-4 md:p-5">
            <TripStageRail status={trip.status} />
            <RouteLine pickup={trip.pickupLabel} dropoff={trip.dropoffLabel} className="text-base" />
            <TripOperatorActions tripId={trip.id} status={trip.status} actorId={actorId} acceptedOfferId={trip.acceptedOffer?.id} actionsEnabled={open} operationsOff={!open} />
          </div>
          <dl className="space-y-3 rounded-xl border bg-card p-4 text-sm">
            <div><dt className="text-xs text-muted-foreground">Driver</dt><dd className="mt-0.5 inline-flex items-center gap-1.5 font-medium"><UserRound className="size-4 text-muted-foreground" aria-hidden="true" />{trip.driver ? <Link href={`/dashboard/platform/drivers/${trip.driver.id}`} className="hover:underline">{trip.driver.publicName}</Link> : 'None'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Vehicle</dt><dd className="mt-0.5 inline-flex items-center gap-1.5 font-medium"><CarFront className="size-4 text-muted-foreground" aria-hidden="true" />{trip.vehicle ? `${trip.vehicle.label}${trip.vehicle.plateMasked ? ` · ${trip.vehicle.plateMasked}` : ''}` : 'None'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Rider</dt><dd className="mt-0.5 font-medium">{trip.rider ? `${trip.rider.name}${trip.rider.email ? ` · ${trip.rider.email}` : ''}` : 'Guest'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Passengers</dt><dd className="mt-0.5 inline-flex items-center gap-1.5 font-medium"><Users className="size-4 text-muted-foreground" aria-hidden="true" />{trip.request?.passengerCount || 1}</dd></div>
          </dl>
        </div>

        <PlatformSection id="payments" title="Payments" meta={trip.payments.length || undefined} actions={payable && !trip.payments.some((payment: any) => !['failed', 'cancelled'].includes(payment.status)) ? <RecordPaymentTrack tripId={trip.id} /> : undefined}>
          {trip.payments.length ? <ul className="space-y-3">{trip.payments.map((payment: any) => {
            const refunded = payment.refunds.filter((refund: any) => ['requested', 'processing', 'succeeded'].includes(refund.status)).reduce((sum: number, refund: any) => sum + (refund.amountMinor || 0), 0)
            const remaining = Math.max(0, (payment.amountMinor || 0) - refunded)
            const manual = payment.provider?.code === 'pp_manual'
            return <li key={payment.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><StatusTitle as="p" tone={statusTone(payment.status)} status={statusLabel(payment.status)} className="text-lg font-semibold tabular-nums">{money(payment.amountMinor, payment.currencyCode)}</StatusTitle><p className="text-xs text-muted-foreground">{payment.provider?.name || 'Provider'} · {payment.capturedAt ? `Paid ${formatWhen(payment.capturedAt)}` : `Recorded ${formatWhen(payment.createdAt)}`}</p></div>
                <div className="flex flex-wrap gap-2">{manual && ['pending', 'authorized'].includes(payment.status) && <ConfirmPaymentTrack paymentId={payment.id} />}{['captured', 'partially_refunded'].includes(payment.status) && remaining > 0 && <RefundSheet paymentId={payment.id} currency={payment.currencyCode} remainingMinor={remaining} />}</div>
              </div>
              {payment.refunds.length > 0 && <ul className="divide-y rounded-lg border">{payment.refunds.map((refund: any) => <li key={refund.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"><StatusTitle as="span" tone={statusTone(refund.status === 'succeeded' ? 'completed' : refund.status === 'failed' ? 'failed' : 'pending')} status={statusLabel(refund.status === 'succeeded' ? 'refunded' : refund.status)} className="tabular-nums">Refund {money(refund.amountMinor, refund.currencyCode)}</StatusTitle><span className="flex items-center gap-2 text-xs text-muted-foreground">{refund.reason}{manual && ['requested', 'processing'].includes(refund.status) && <ConfirmRefundTrack refundId={refund.id} />}</span></li>)}</ul>}
            </li>
          })}</ul> : <PlatformEmpty>{payable ? 'No charge recorded' : 'Payments start once a driver is assigned'}</PlatformEmpty>}
        </PlatformSection>

        <div className="grid gap-8 lg:grid-cols-2">
          <PlatformSection id="timeline" title="Timeline">
            {trip.events.length ? <ol className="space-y-2.5 rounded-xl border bg-card p-4">{trip.events.map((event: any) => <li key={event.id} className="flex items-center gap-2.5 text-sm"><StatusDot tone={statusTone(event.toStatus || 'requested')} /><span className="font-medium">{eventLabel(event)}</span>{event.actorType && <span className="text-xs text-muted-foreground">{event.actorType}</span>}<span className="ml-auto text-xs tabular-nums text-muted-foreground">{formatWhen(event.occurredAt)}</span></li>)}</ol> : <PlatformEmpty>No events</PlatformEmpty>}
            {trip.cancellations.map((cancellation: any) => <p key={cancellation.id} className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Cancelled by {cancellation.actorType || 'unknown'} · {statusLabel(cancellation.reasonCode)} · fee {money(cancellation.feeMinor, cancellation.currencyCode)} · refund {statusLabel(cancellation.refundRequired)}</p>)}
          </PlatformSection>
          <PlatformSection id="messages" title="Messages" meta={trip.conversation?.messages.length || undefined}>
            <div className="space-y-3 rounded-xl border bg-card p-4">
              {trip.conversation?.messages.length ? <ol className="max-h-80 space-y-2 overflow-y-auto">{trip.conversation.messages.map((message: any) => <li key={message.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${message.senderType === 'operator' ? 'ml-auto bg-foreground text-background' : 'bg-muted'}`}><p className="whitespace-pre-wrap">{message.body}</p><p className="mt-1 text-[0.6875rem] opacity-70">{message.senderType} · {formatWhen(message.createdAt)}</p></li>)}</ol> : <p className="text-sm text-muted-foreground">No messages</p>}
              {trip.conversation?.status !== 'blocked' && <MessageComposer tripId={trip.id} />}
            </div>
          </PlatformSection>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <PlatformSection id="cases" title="Safety & support" meta={(trip.incidents.length + trip.supportCases.length) || undefined}>
            {trip.incidents.length + trip.supportCases.length ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {trip.incidents.map((incident: any) => <li key={incident.id} className="space-y-2 px-4 py-3"><StatusTitle as="p" tone={statusTone(incident.status)} status={`${statusLabel(incident.status)} · ${incident.severity}`} className="font-mono text-sm font-semibold">{incident.caseNumber}</StatusTitle>{incident.summary && <p className="text-sm">{incident.summary}</p>}<IncidentActions incidentId={incident.id} status={incident.status} assigned={incident.assignedTo?.id === actorId} /></li>)}
              {trip.supportCases.map((supportCase: any) => <li key={supportCase.id} className="space-y-2 px-4 py-3"><StatusTitle as="p" tone={statusTone(supportCase.status)} status={statusLabel(supportCase.status)} className="font-mono text-sm font-semibold">{supportCase.caseNumber}</StatusTitle>{supportCase.subject && <p className="text-sm">{supportCase.subject}</p>}<SupportCaseActions caseId={supportCase.id} status={supportCase.status} assigned={supportCase.assignedTo?.id === actorId} /></li>)}
            </ul> : <PlatformEmpty>No reports on this trip</PlatformEmpty>}
          </PlatformSection>
          <PlatformSection id="reviews" title="Reviews" meta={trip.reviews.length || undefined}>
            {trip.reviews.length ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">{trip.reviews.map((review: any) => <li key={review.id} className="space-y-1 px-4 py-3 text-sm"><StatusTitle as="p" tone={review.status === 'published' ? 'green' : review.status === 'pending' ? 'amber' : 'zinc'} status={statusLabel(review.status)}>{typeof review.rating === 'number' ? <span className="inline-flex items-center gap-1 tabular-nums"><Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />{review.rating}/5</span> : 'No rating'}</StatusTitle>{review.body && <p className="text-muted-foreground">{review.body}</p>}</li>)}</ul> : <PlatformEmpty>No reviews</PlatformEmpty>}
          </PlatformSection>
        </div>
      </>}
    </div>
  </>
}

export default TripDetailPage

'use client'

import { SetupSheet, TransitionTrack } from '@/features/platform/components/SetupSheet'
import { setup } from '@/features/platform/setup/setupMutations'

type Area = { id: string; name: string }

export function AddAreaSheet({ fleetId }: { fleetId: string }) {
  return <SetupSheet trigger="Add area" tone="default" title="Add service area" submitLabel="Add area" onSubmit={values => setup.area({ ...values, fleetId })} fields={[
    { name: 'name', label: 'Area name', type: 'text', required: true, maxLength: 120, placeholder: 'Harbor City core' },
    { name: 'publicRegionLabel', label: 'Name riders see', type: 'text', required: true, maxLength: 160, placeholder: 'Harbor City central neighborhoods' },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'active', options: [{ value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }] },
  ]} />
}

export function AddServiceSheet({ fleetId, areas }: { fleetId: string; areas: Area[] }) {
  return <SetupSheet trigger="Add service" title="Add ride service" submitLabel="Add service" onSubmit={values => setup.service({ ...values, fleetId })} fields={[
    { name: 'name', label: 'Service name', type: 'text', required: true, maxLength: 80, placeholder: 'Standard' },
    { name: 'description', label: 'Description', type: 'textarea', maxLength: 500 },
    { name: 'category', label: 'Category', type: 'select', required: true, defaultValue: 'standard', options: [{ value: 'standard', label: 'Standard' }, { value: 'comfort', label: 'Comfort' }, { value: 'xl', label: 'XL' }, { value: 'accessible', label: 'Accessible' }, { value: 'pet_friendly', label: 'Pet friendly' }, { value: 'scheduled', label: 'Scheduled' }] },
    { name: 'passengerCapacity', label: 'Passenger seats', type: 'number', required: true, min: 1, max: 50, defaultValue: 4 },
    { name: 'advanceBookingMinutes', label: 'Book ahead (minutes)', type: 'number', min: 0, max: 43200, defaultValue: 0 },
    { name: 'wheelchairAccessible', label: 'Wheelchair-accessible vehicles only', type: 'checkbox' },
    { name: 'serviceAreaIds', label: 'Service areas', type: 'multi', required: true, options: areas.map(area => ({ value: area.id, label: area.name })), defaultValue: areas.length === 1 ? [areas[0].id] : [] },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'draft', options: [{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }] },
  ]} />
}

export function AddFareSheet({ serviceId, serviceName, currency, areas }: { serviceId: string; serviceName: string; currency: string; areas: Area[] }) {
  return <SetupSheet trigger="New fare" tone="default" title={`Fare for ${serviceName}`} submitLabel="Save fare" onSubmit={values => setup.fare({ ...values, serviceId })} fields={[
    { name: 'name', label: 'Fare name', type: 'text', required: true, maxLength: 120, defaultValue: `${serviceName} fare` },
    { name: 'serviceAreaId', label: 'Service area', type: 'select', required: true, defaultValue: areas[0]?.id, options: areas.map(area => ({ value: area.id, label: area.name })) },
    { name: 'distanceUnit', label: 'Distance unit', type: 'select', required: true, defaultValue: 'mile', options: [{ value: 'mile', label: 'Mile' }, { value: 'kilometer', label: 'Kilometre' }] },
    { name: 'baseFareMinor', label: 'Base fare', type: 'money', currency, required: true },
    { name: 'perDistanceUnitMinor', label: 'Per mile or km', type: 'money', currency, required: true },
    { name: 'perMinuteMinor', label: 'Per minute', type: 'money', currency, required: true },
    { name: 'bookingFeeMinor', label: 'Booking fee', type: 'money', currency },
    { name: 'minimumFareMinor', label: 'Minimum fare', type: 'money', currency },
    { name: 'cancellationFeeMinor', label: 'Cancellation fee', type: 'money', currency },
    { name: 'noShowFeeMinor', label: 'No-show fee', type: 'money', currency },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'active', options: [{ value: 'active', label: 'Active (replaces the current fare)' }, { value: 'draft', label: 'Draft' }] },
  ]} />
}

export function ServiceStatusTrack({ id, status }: { id: string; status: string }) {
  return <TransitionTrack label="Service status" actions={status === 'active'
    ? [{ label: 'Pause', run: () => setup.serviceStatus(id, 'paused') }]
    : [{ label: 'Activate', tone: 'primary', run: () => setup.serviceStatus(id, 'active') }]} />
}

export function AreaStatusTrack({ id, status }: { id: string; status: string }) {
  return <TransitionTrack label="Area status" actions={status === 'active'
    ? [{ label: 'Pause', tone: 'quiet', run: () => setup.areaStatus(id, 'paused') }]
    : [{ label: 'Activate', tone: 'primary', run: () => setup.areaStatus(id, 'active') }]} />
}

'use client'

import { SetupSheet, type SetupField } from '@/features/platform/components/SetupSheet'
import { setup } from '@/features/platform/setup/setupMutations'

export function AddFleetVehicleSheet({ fleets, drivers }: { fleets: Array<{ id: string; name: string }>; drivers: Array<{ id: string; publicName: string; fleetId: string }> }) {
  if (!fleets.length) return null
  const fields: SetupField[] = [
    ...(fleets.length > 1 ? [{ name: 'fleetId', label: 'Fleet', type: 'select' as const, required: true, options: fleets.map(fleet => ({ value: fleet.id, label: fleet.name })) }] : []),
    { name: 'label', label: 'Name', type: 'text', required: true, maxLength: 80, placeholder: 'Blue 2022 Hybrid' },
    { name: 'make', label: 'Make', type: 'text', maxLength: 60 },
    { name: 'model', label: 'Model', type: 'text', maxLength: 60 },
    { name: 'year', label: 'Year', type: 'number', min: 1980, max: new Date().getFullYear() + 1 },
    { name: 'color', label: 'Colour', type: 'text', maxLength: 40 },
    { name: 'plateMasked', label: 'Plate (shown to riders)', type: 'text', maxLength: 20 },
    { name: 'capacity', label: 'Passenger seats', type: 'number', required: true, min: 1, max: 50, defaultValue: 4 },
    { name: 'wheelchairAccessible', label: 'Wheelchair accessible', type: 'checkbox' },
    { name: 'driverIds', label: 'Drivers', type: 'multi', options: drivers.map(driver => ({ value: driver.id, label: fleets.length > 1 ? `${driver.publicName} · ${fleets.find(fleet => fleet.id === driver.fleetId)?.name || ''}` : driver.publicName })) },
  ]
  return <SetupSheet trigger="Add vehicle" title="Add vehicle" submitLabel="Add vehicle" fields={fields} onSubmit={values => setup.vehicle({ ...values, fleetId: values.fleetId || fleets[0].id })} />
}

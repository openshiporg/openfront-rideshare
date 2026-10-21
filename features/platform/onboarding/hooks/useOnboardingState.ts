'use client'
import { useState } from 'react'
export function useOnboardingState(){const[mode,setMode]=useState<'minimal'|'full'>('full');return{mode,setMode}}

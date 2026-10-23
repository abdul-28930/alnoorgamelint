/**
 * Every WhatsApp message the app can send. The order of `vars` is the order of {{1}}, {{2}}... in the approved template,
 * so changing a template's wording is free but changing its variables means changing this list too.
 */
export type WhatsappEvent =
  | 'reservation_received'
  | 'booking_confirmed'
  | 'receipt_ready'
  | 'tournament_registered'
  | 'tournament_waitlist_moved_up'
  | 'tournament_update'
  | 'match_call'

export interface EventDef {
  label: string
  description: string
  /** the template used until staff change it in Settings */
  defaultTemplate: string
  /** template variables, in order */
  vars: string[]
  sample: Record<string, string>
  /** the template has a "View tournament" button with a dynamic link ending in the tournament id */
  urlButton?: boolean
  /** the template has a PDF in its header (the file link is passed when sending) */
  document?: boolean
}

export const EVENTS: Record<WhatsappEvent, EventDef> = {
  reservation_received: {
    label: 'New reservation',
    description: 'Sent to the customer when a reservation is made.',
    defaultTemplate: 'reservation_received',
    vars: ['name', 'station_type', 'date', 'amount', 'reference'],
    sample: { name: 'Rahul', station_type: 'PS5', date: '31 Oct 2026', amount: '300', reference: 'NGC1A2B' },
  },
  booking_confirmed: {
    label: 'New booking',
    description: 'Sent to the customer when a booking is made.',
    defaultTemplate: 'booking_confirmed',
    vars: ['name', 'station', 'date', 'time', 'hours', 'amount', 'reference'],
    sample: { name: 'Rahul', station: 'Afterlife PS5 Omega s3', date: '31 Oct 2026', time: '4:00 PM', hours: '2', amount: '150', reference: 'NGC1A2B' },
  },
  receipt_ready: {
    label: 'Receipt',
    description: 'Sent with the receipt PDF attached.',
    defaultTemplate: 'receipt_ready',
    vars: ['name', 'reference', 'amount'],
    sample: { name: 'Rahul', reference: 'NGC1A2B', amount: '150' },
    document: true,
  },
  tournament_registered: {
    label: 'Tournament registration',
    description: 'Sent when a player registers or joins the waitlist.',
    defaultTemplate: 'tournament_registered',
    vars: ['name', 'tournament', 'status', 'starts'],
    sample: { name: 'Rahul', tournament: 'NEO RIFT - EAFC SEASON 1', status: 'Registered', starts: '31 Oct 2026 11:00 AM' },
    urlButton: true,
  },
  tournament_waitlist_moved_up: {
    label: 'Waitlist place opened',
    description: 'Sent when a waitlisted player gets a place.',
    defaultTemplate: 'tournament_waitlist_moved_up',
    vars: ['name', 'tournament'],
    sample: { name: 'Rahul', tournament: 'NEO RIFT - EAFC SEASON 1' },
    urlButton: true,
  },
  tournament_update: {
    label: 'Tournament notification',
    description: 'Sent by staff with the "Send notification" button.',
    defaultTemplate: 'tournament_update',
    vars: ['name', 'tournament', 'message'],
    sample: { name: 'Rahul', tournament: 'NEO RIFT - EAFC SEASON 1', message: 'Round of 64 starts at 11:00 AM. Please arrive by 10:30 AM.' },
    urlButton: true,
  },
  match_call: {
    label: 'Match call',
    description: 'Sent by staff to call a player for their match.',
    defaultTemplate: 'match_call',
    vars: ['name', 'tournament'],
    sample: { name: 'Rahul', tournament: 'NEO RIFT - EAFC SEASON 1' },
  },
}

export const EVENT_KEYS = Object.keys(EVENTS) as WhatsappEvent[]
export const isEvent = (v: string): v is WhatsappEvent => v in EVENTS

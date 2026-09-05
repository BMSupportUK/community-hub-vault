import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
import { template as twofaResetAdmin } from './twofa-reset-admin'
import { template as twofaResetUser } from './twofa-reset-user'
import { template as subscriptionExpiryReminder } from './subscription-expiry-reminder'
import { template as wcGuestPinReset } from './wc-guest-pin-reset'
import { template as wcPredictionReminder } from './wc-prediction-reminder'
import { template as boroPredictionReminder } from './boro-prediction-reminder'
import { template as fantasySquadReminder } from './fantasy-squad-reminder'
import { template as boroPredictionFinalReminder } from './boro-prediction-final-reminder'
import { template as fantasySquadFinalReminder } from './fantasy-squad-final-reminder'
import { template as boroPredictorInvite } from './boro-predictor-invite'
import { template as ticketReply } from './ticket-reply'
import { template as vaultPinReset } from './vault-pin-reset'
import { template as winnerNotification } from './winner-notification'
import { template as screenLockReset } from './screen-lock-reset'
import { template as accountApproved } from './account-approved'
import { template as fanZoneApproved } from './fan-zone-approved'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'twofa-reset-admin': twofaResetAdmin,
  'twofa-reset-user': twofaResetUser,
  'subscription-expiry-reminder': subscriptionExpiryReminder,
  'wc-guest-pin-reset': wcGuestPinReset,
  'wc-prediction-reminder': wcPredictionReminder,
  'boro-prediction-reminder': boroPredictionReminder,
  'fantasy-squad-reminder': fantasySquadReminder,
  'boro-prediction-final-reminder': boroPredictionFinalReminder,
  'fantasy-squad-final-reminder': fantasySquadFinalReminder,
  'boro-predictor-invite': boroPredictorInvite,
  'ticket-reply': ticketReply,
  'vault-pin-reset': vaultPinReset,
  'winner-notification': winnerNotification,
  'screen-lock-reset': screenLockReset,
  'account-approved': accountApproved,
  'fan-zone-approved': fanZoneApproved,
}

import { createEmailWebhookHandler } from '@lovable.dev/email-js'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'

type Reason = 'bounce' | 'complaint' | 'unsubscribe'

function statusForReason(reason: Reason): 'bounced' | 'complained' | 'suppressed' {
  switch (reason) {
    case 'bounce':
      return 'bounced'
    case 'complaint':
      return 'complained'
    default:
      return 'suppressed'
  }
}

function messageForReason(reason: Reason): string {
  switch (reason) {
    case 'bounce':
      return 'Permanent bounce — email address is invalid or rejected'
    case 'complaint':
      return 'Spam complaint — recipient marked email as spam'
    default:
      return 'Recipient unsubscribed'
  }
}

async function recordOutcome(
  reason: Reason,
  recipient: string,
  messageId: string | null,
  eventId: string,
) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Server configuration error')
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const normalizedEmail = recipient.toLowerCase()

  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert(
      { email: normalizedEmail, reason, metadata: null },
      { onConflict: 'email' },
    )
  if (suppressError) {
    console.error('Failed to upsert suppressed email', {
      code: (suppressError as any)?.code,
      message: (suppressError as any)?.message,
      event_id: eventId,
    })
    throw new Error('Failed to write suppression')
  }

  const { error: logError } = await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: 'system',
    recipient_email: normalizedEmail,
    status: statusForReason(reason),
    error_message: messageForReason(reason),
    metadata: null,
  })
  if (logError) {
    console.error('Failed to insert email_send_log', {
      code: (logError as any)?.code,
      message: (logError as any)?.message,
      event_id: eventId,
    })
    throw new Error('Failed to write email send log')
  }
}

export const Route = createFileRoute("/lovable/email/events")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY']
        if (!apiKey) {
          console.error('Missing required environment variables')
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }
        const handler = createEmailWebhookHandler({
          apiKey,
          on: {
            'email.bounced': async (event) => {
              await recordOutcome(
                'bounce',
                event.data.recipient,
                event.data.message_id ?? null,
                event.event_id,
              )
            },
            'email.complaint': async (event) => {
              await recordOutcome(
                'complaint',
                event.data.recipient,
                event.data.message_id ?? null,
                event.event_id,
              )
            },
            'email.unsubscribed': async (event) => {
              await recordOutcome(
                'unsubscribe',
                event.data.recipient,
                event.data.message_id ?? null,
                event.event_id,
              )
            },
          },
        })
        return handler(request)
      },
    },
  },
})

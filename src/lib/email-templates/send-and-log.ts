import { sendTemplateEmail } from './send-email'

/**
 * Server-only: sends a registered template through Lovable's managed email API
 * and records the outcome in the app's email_send_log table.
 *
 * The log row is informational only — it never decides whether a send happens
 * (Lovable enforces suppression and retries server-side).
 */
export interface SendAndLogOptions {
  templateData?: Record<string, any>
  idempotencyKey?: string
  replyTo?: string
}

type LogStatus = 'sent' | 'suppressed' | 'failed'

async function writeLog(
  admin: any,
  templateName: string,
  recipient: string,
  status: LogStatus,
  errorMessage?: string,
) {
  try {
    const { error } = await admin.from('email_send_log').insert({
      message_id: null,
      template_name: templateName,
      recipient_email: recipient,
      status,
      error_message: errorMessage ?? null,
    } as never)
    if (error) {
      console.error('Failed to write email_send_log row', {
        code: (error as any)?.code,
        message: (error as any)?.message,
        template_name: templateName,
        status,
      })
    }
  } catch (e) {
    console.error('Failed to write email_send_log row', e)
  }
}

export async function sendAndLogEmail(
  admin: any,
  templateName: string,
  recipient: string,
  options: SendAndLogOptions = {},
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const result = await sendTemplateEmail(templateName, recipient, options)
    if (result.sent) {
      await writeLog(admin, templateName, recipient, 'sent')
      return { sent: true }
    }
    await writeLog(admin, templateName, recipient, 'suppressed', result.reason)
    return { sent: false, reason: result.reason }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await writeLog(admin, templateName, recipient, 'failed', message.slice(0, 1000))
    throw error
  }
}

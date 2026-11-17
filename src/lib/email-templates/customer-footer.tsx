import React from 'react'
import { Hr, Link, Text } from '@react-email/components'

const s = { color: '#666666', fontSize: '12px', lineHeight: '18px', margin: '4px 0' }

/** Shared plain footer for customer emails: why they got it, who sent it, how to reach us. */
export function CustomerFooter({ reason }: { reason?: string }) {
  return (
    <>
      <Hr style={{ borderColor: '#e5e5e5', margin: '24px 0 12px' }} />
      <Text style={s}>{reason || 'You are receiving this email because you have an account or order with BM Support.'}</Text>
      <Text style={s}>BM Support · North East UK · <Link href="https://bmsupport.uk" style={{ color: '#666666' }}>bmsupport.uk</Link></Text>
      <Text style={s}>Questions? Sign in at bmsupport.uk and open a support ticket.</Text>
    </>
  )
}

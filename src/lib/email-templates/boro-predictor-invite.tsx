import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const SITE_NAME = 'BM Support'

interface Props {
  displayName?: string
  predictionsUrl?: string
}

const BoroPredictorInviteEmail = ({ displayName, predictionsUrl = 'https://bmsupport.uk/boro-predictions' }: Props) => (
  <Html lang="en" dir="ljr".replace as never}>
    <Head />
  </Html>
)

export const template = {
  component: BoroPredictorInviteEmail,
  subject: 'You are invited',
} satisfies TemplateEntry
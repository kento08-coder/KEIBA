import { z } from 'zod'

export const RaceRegistrationSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '開催日を指定してください。'),
    distanceM: z.number().int().min(100).max(20_000),
    name: z.string().trim().min(1, 'レース名を入力してください。').max(120),
    organizer: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_]+$/, '主催者コードは英大文字・数字・_で指定してください。')
      .max(20),
    raceNumber: z.number().int().min(1).max(99),
    surface: z.enum(['turf', 'dirt', 'obstacle', 'other', 'unknown']),
    venueCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_]+$/, '競馬場コードは英大文字・数字・_で指定してください。')
      .max(30),
  })
  .strict()

export type RaceRegistrationInput = z.infer<typeof RaceRegistrationSchema>

export function buildRegisteredRaceId(input: RaceRegistrationInput) {
  return [
    input.date,
    input.venueCode,
    input.raceNumber.toString().padStart(2, '0'),
    input.organizer,
  ].join('-')
}

import {
  buildRegisteredRaceId,
  RaceRegistrationSchema,
} from '../../src/features/races/model'

describe('race registration model', () => {
  it('normalizes organizer and venue codes and creates the documented id', () => {
    const input = RaceRegistrationSchema.parse({
      date: '2026-11-08',
      distanceM: 2000,
      name: 'サンプルステークス',
      organizer: 'jra',
      raceNumber: 11,
      surface: 'turf',
      venueCode: 'tokyo',
    })

    expect(buildRegisteredRaceId(input)).toBe('2026-11-08-TOKYO-11-JRA')
  })

  it('rejects guessed free-form venue codes', () => {
    const result = RaceRegistrationSchema.safeParse({
      date: '2026-11-08',
      distanceM: 2000,
      name: 'サンプルステークス',
      organizer: 'JRA',
      raceNumber: 11,
      surface: 'turf',
      venueCode: '東京',
    })

    expect(result.success).toBe(false)
  })
})

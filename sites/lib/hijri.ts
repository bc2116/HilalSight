const ISLAMIC_EPOCH = 1948439.5

export const HIJRI_MONTH_NAMES = [
  'Muharram',
  'Safar',
  'Rabi al-Awwal',
  'Rabi al-Thani',
  'Jumada al-Awwal',
  'Jumada al-Thani',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qi'dah",
  'Dhu al-Hijjah',
]

export type HijriDate = { year: number; month: number; day: number }

function gregorianToJd(date: Date): number {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  const jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
  return jdn - 0.5
}

function jdToGregorian(jd: number): Date {
  const jdn = Math.floor(jd + 0.5)
  const a = jdn + 32044
  const b = Math.floor((4 * a + 3) / 146097)
  const c = a - Math.floor((146097 * b) / 4)
  const d = Math.floor((4 * c + 3) / 1461)
  const e = c - Math.floor((1461 * d) / 4)
  const m = Math.floor((5 * e + 2) / 153)
  const day = e - Math.floor((153 * m + 2) / 5) + 1
  const month = m + 3 - 12 * Math.floor(m / 10)
  const year = 100 * b + d - 4800 + Math.floor(m / 10)
  return new Date(Date.UTC(year, month - 1, day))
}

function islamicToJd({ year, month, day }: HijriDate): number {
  return day + Math.ceil(29.5 * (month - 1)) + (year - 1) * 354 + Math.floor((3 + 11 * year) / 30) + ISLAMIC_EPOCH - 1
}

export function gregorianToHijri(date: Date): HijriDate {
  const jd = gregorianToJd(date)
  const year = Math.floor((30 * (jd - ISLAMIC_EPOCH) + 10646) / 10631)
  const month = Math.min(12, Math.ceil((jd - (29 + islamicToJd({ year, month: 1, day: 1 }))) / 29.5) + 1)
  const day = Math.floor(jd - islamicToJd({ year, month, day: 1 }) + 1)
  return { year, month, day }
}

export function hijriToGregorian(hijri: HijriDate): Date {
  return jdToGregorian(islamicToJd(hijri))
}

export function addHijriMonth(hijri: HijriDate): HijriDate {
  const monthIndex = hijri.month
  return {
    year: hijri.year + Math.floor(monthIndex / 12),
    month: (monthIndex % 12) + 1,
    day: 1,
  }
}

export function monthName(month: number): string {
  return HIJRI_MONTH_NAMES[month - 1] ?? 'Unknown'
}

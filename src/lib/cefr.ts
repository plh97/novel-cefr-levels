export const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

export type CefrLevel = (typeof CEFR_ORDER)[number]
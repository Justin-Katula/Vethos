declare module 'culori' {
  export type Color = Record<string, unknown>

  export function parse(value: string): Color | undefined

  export function differenceCiede2000(): (a: Color, b: Color) => number
}

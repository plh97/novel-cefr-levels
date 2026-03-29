/// <reference types="vite/client" />

declare module 'vocabulary-list-statistics' {
  const value: Array<{
    rank: number
    word: string
    percent: number
    cumulative: number
  }>

  export default value
}

declare module '*.txt?url' {
  const value: string
  export default value
}
declare module 'wink-lemmatizer' {
  const lemmatizer: {
    adjective(word: string): string
    lemmatizeAdjective(word: string): string
    lemmatizeNoun(word: string): string
    lemmatizeVerb(word: string): string
    noun(word: string): string
    verb(word: string): string
  }

  export default lemmatizer
}
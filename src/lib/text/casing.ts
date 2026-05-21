const ENGLISH_LOCALE = "en-US";

export function toEnglishUppercase(value: string) {
  return value.toLocaleUpperCase(ENGLISH_LOCALE);
}

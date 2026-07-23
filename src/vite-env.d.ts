/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'arabic-persian-reshaper' {
  const arabic: { convertArabic(text: string): string };
  export default arabic;
}

declare module '*.ttf?url' {
  const src: string;
  export default src;
}

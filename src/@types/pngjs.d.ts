declare module 'pngjs' {
  export const PNG: {
    new (options: { width: number; height: number }): {
      data: Uint8Array
      width: number
      height: number
    }
    sync: {
      read: (data: Uint8Array) => {
        data: Uint8Array
        width: number
        height: number
      }
      write: (png: {
        data: Uint8Array
        width: number
        height: number
      }) => Uint8Array
    }
  }
}

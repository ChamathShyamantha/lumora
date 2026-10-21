// openrgb-sdk's package.json points "types" at a file it doesn't ship; re-export its real declarations.
declare module 'openrgb-sdk' {
  export { default as Client } from 'openrgb-sdk/dist/client'
  export { default as Device } from 'openrgb-sdk/dist/device'
}

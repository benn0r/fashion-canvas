# Fashion Canvas

> [!IMPORTANT]
> **This entire repository, including the application, design, tests, documentation, and deployment setup was made with AI.**

An Expo React Native wardrobe app that captures a mirror selfie, uploads it to Fashion Canvas Server, and saves the generated outfit and separately identified pieces with every AI-provided description.

## Screenshot

![Fashion Canvas mobile app](docs/screenshot.png)

## Features

- Camera page with camera and photo-library capture, upload progress, generated outfit preview, and category selection for the outfit and every piece.
- Outfits and Pieces pages grouped into compact category accordions with configurable 2/3/4-column grids.
- Settings page for outfit and piece category management plus independent grid-density controls.
- Same-category pieces can be merged while saving an AI result or from piece details; outfit links and AI descriptions are preserved.
- Linked outfit and piece detail sheets with bidirectional navigation and AI-provided descriptions.
- Local-only persistence: metadata and relationships in AsyncStorage, images in Expo FileSystem on Android/iOS, and image blobs in IndexedDB on web.
- Deleting a category safely moves its contents to `Uncategorized`.

## Development

```sh
cp .env.example .env
npm ci
npm start
```

Set `EXPO_PUBLIC_FASHION_CANVAS_API_URL` to the reachable Fashion Canvas Server origin. A physical phone cannot reach a server through the phone's own `localhost`; use a development-machine LAN address or a deployed HTTPS endpoint.

Run verification with:

```sh
npm run typecheck
npm run build
npm test
npm run test:e2e
```

## Persistence note

Generated images are currently stored as returned data URLs in AsyncStorage. This is suitable for a prototype library. Before a large production library, move image data to the device filesystem or object storage and retain only durable URIs and metadata in AsyncStorage.

## CI

The Gitea pipeline performs an uncached install in separate build, unit-test, browser-E2E, and image-publishing jobs. The published container is a web preview of the same Expo application; native iOS and Android releases should be signed through an appropriate mobile release workflow.

## License

MIT

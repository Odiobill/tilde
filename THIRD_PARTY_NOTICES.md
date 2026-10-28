# Third-party notices

Original Tilde code and its code-authored icon use the MIT license, copyright
2026 Davide Lucchesi (owner-confirmed attribution). Dependencies retain their own
licenses; they are not relicensed as Tilde code.

The generated inventory records the locked production npm closure, actual source
references, notice digests and component scopes. Package license files remain in
the runtime closure. Supplemental full texts, pinned source locks and provenance
are preserved under `packaging/licenses` in source and
`share/licenses/tilde/third-party` in an installed tree.

Qt and Node are dynamically used system dependencies and are not redistributed.
Their entries describe system dependencies, not bundled copies or a blanket native
ABI qualification. The Arch recipe lists the selected redistributed license terms;
complete upstream alternative-license texts are retained where applicable.

## Audited shipped artifacts

`packaging/licenses/shipped-provenance.json` binds the unchanged proxy-agent-negotiate,
Photon and QuickJS npm artifacts to their lock integrities, actual selected binary
hashes, upstream source inputs and notice texts. npm SLSA signatures were verified
for proxy-agent-negotiate and quickjs-wasi. Photon is corroborated by the exact
published source crate/VCS/lock, binary crate versions, producer metadata and an
exact embedded Roboto font byte match. This is not a bit-for-bit rebuild claim.

proxy-agent-negotiate declares MIT and Nathan Rajlich as author but supplies no
license file. Its supplemental notice explicitly retains the full shared Nathan
Rajlich MIT notice from the same pinned upstream monorepo's proxy-agent package;
its sibling-file origin is recorded rather than represented as a negotiate file.

Photon dependency/build and Rust runtime-source entries conservatively cover the
resolved normal/build graph and relevant runtime source. QuickJS includes its
actual submodule, vendored Ada/crypto/Unicode and pinned WASI SDK runtime notices.
`source-build-notice-superset` entries are notice coverage, not assertions that
every listed crate/routine is linked. Unactivated wee_alloc and explicitly disjoint
Rust targets are excluded. Exact scope and source/hash facts are in the provenance
record. These notices do not enable any excluded production feature.

## Inventory

No unresolved notice entries remain in this generated inventory. This does not
replace the final artifact's qualification report or establish universal legal,
platform or hardware compatibility.

| Component | Version | License | Linkage |
|---|---|---|---|
| @anthropic-ai/sdk | 0.129.0 | MIT | js |
| @aws-sdk/client-bedrock-runtime | 3.1127.0 | Apache-2.0 | js |
| @aws-sdk/core | 3.978.6 | Apache-2.0 | js |
| @aws-sdk/credential-provider-env | 3.972.77 | Apache-2.0 | js |
| @aws-sdk/credential-provider-http | 3.972.79 | Apache-2.0 | js |
| @smithy/node-http-handler | 4.13.0 | Apache-2.0 | js |
| @aws-sdk/credential-provider-ini | 3.973.22 | Apache-2.0 | js |
| @aws-sdk/credential-provider-login | 3.972.84 | Apache-2.0 | js |
| @aws-sdk/credential-provider-node | 3.972.89 | Apache-2.0 | js |
| @aws-sdk/credential-provider-process | 3.972.77 | Apache-2.0 | js |
| @aws-sdk/credential-provider-sso | 3.973.21 | Apache-2.0 | js |
| @aws-sdk/token-providers | 3.1157.0 | Apache-2.0 | js |
| @aws-sdk/credential-provider-web-identity | 3.972.83 | Apache-2.0 | js |
| @aws-sdk/eventstream-handler-node | 3.972.39 | Apache-2.0 | js |
| @aws-sdk/middleware-eventstream | 3.972.34 | Apache-2.0 | js |
| @aws-sdk/middleware-websocket | 3.972.59 | Apache-2.0 | js |
| @aws-sdk/nested-clients | 3.997.51 | Apache-2.0 | js |
| @smithy/node-http-handler | 4.13.0 | Apache-2.0 | js |
| @aws-sdk/signature-v4-multi-region | 3.996.49 | Apache-2.0 | js |
| @aws-sdk/token-providers | 3.1127.0 | Apache-2.0 | js |
| @aws-sdk/types | 3.975.0 | Apache-2.0 | js |
| @aws-sdk/xml-builder | 3.972.41 | Apache-2.0 | js |
| @aws/lambda-invoke-store | 0.3.0 | Apache-2.0 | js |
| @babel/runtime | 7.29.10 | MIT | js |
| @earendil-works/chord | 1.4.0 | MIT | js |
| @earendil-works/pi-ai | 1.4.0 | MIT | js |
| @earendil-works/pi-codemode | 1.4.0 | MIT | js |
| @earendil-works/pi-durable | 1.4.0 | MIT | js |
| @earendil-works/pi-telemetry | 1.4.0 | MIT | js |
| @google/genai | 2.21.0 | Apache-2.0 | js |
| @protobufjs/aspromise | 1.1.2 | BSD-3-Clause | js |
| @protobufjs/base64 | 1.1.2 | BSD-3-Clause | js |
| @protobufjs/codegen | 2.0.5 | BSD-3-Clause | js |
| @protobufjs/eventemitter | 1.1.1 | BSD-3-Clause | js |
| @protobufjs/fetch | 1.1.1 | BSD-3-Clause | js |
| @protobufjs/float | 1.0.2 | BSD-3-Clause | js |
| @protobufjs/path | 1.1.2 | BSD-3-Clause | js |
| @protobufjs/pool | 1.1.0 | BSD-3-Clause | js |
| @protobufjs/utf8 | 1.1.2 | BSD-3-Clause | js |
| @silvia-odwyer/photon | 0.3.3 | Apache-2.0 | js |
| @smithy/core | 3.37.0 | Apache-2.0 | js |
| @smithy/credential-provider-imds | 4.5.2 | Apache-2.0 | js |
| @smithy/fetch-http-handler | 5.8.0 | Apache-2.0 | js |
| @smithy/node-http-handler | 4.12.1 | Apache-2.0 | js |
| @smithy/signature-v4 | 5.7.4 | Apache-2.0 | js |
| @smithy/types | 4.19.0 | Apache-2.0 | js |
| @stablelib/base64 | 1.0.1 | MIT | js |
| @types/node | 24.10.1 | MIT | js |
| agent-base | 9.0.0 | MIT | js |
| base64-js | 1.5.1 | MIT | js |
| bignumber.js | 9.3.1 | MIT | js |
| bowser | 2.15.0 | MIT | js |
| buffer-equal-constant-time | 1.0.1 | BSD-3-Clause | js |
| data-uri-to-buffer | 4.0.1 | MIT | js |
| debug | 4.4.3 | MIT | js |
| diff | 8.0.4 | BSD-3-Clause | js |
| ecdsa-sig-formatter | 1.0.11 | Apache-2.0 | js |
| extend | 3.0.2 | MIT | js |
| fast-sha256 | 1.3.0 | Unlicense | js |
| fetch-blob | 3.2.0 | MIT | js |
| formdata-polyfill | 4.0.10 | MIT | js |
| gaxios | 7.3.1 | Apache-2.0 | js |
| agent-base | 7.1.4 | MIT | js |
| https-proxy-agent | 7.0.6 | MIT | js |
| gcp-metadata | 8.1.2 | Apache-2.0 | js |
| google-auth-library | 10.9.1 | Apache-2.0 | js |
| google-logging-utils | 1.1.3 | Apache-2.0 | js |
| graceful-fs | 4.2.11 | ISC | js |
| http-proxy-agent | 9.1.0 | MIT | js |
| https-proxy-agent | 9.1.0 | MIT | js |
| json-bigint | 1.0.0 | MIT | js |
| json-schema-to-ts | 3.1.1 | MIT | js |
| jwa | 2.0.1 | MIT | js |
| jws | 4.0.1 | MIT | js |
| long | 5.3.2 | Apache-2.0 | js |
| ms | 2.1.3 | MIT | js |
| node-domexception | 1.0.0 | MIT | js |
| node-fetch | 3.3.2 | MIT | js |
| openai | 7.19.0 | Apache-2.0 | js |
| p-retry | 4.6.2 | MIT | js |
| @types/retry | 0.12.0 | MIT | js |
| partial-json | 0.1.7 | MIT | js |
| proper-lockfile | 4.1.2 | MIT | js |
| retry | 0.12.0 | MIT | js |
| protobufjs | 7.6.6 | BSD-3-Clause | js |
| proxy-agent-negotiate | 1.1.0 | MIT | js |
| quickjs-wasi | 3.6.2 | MIT | js |
| retry | 0.13.1 | MIT | js |
| safe-buffer | 5.2.1 | MIT | js |
| signal-exit | 3.0.7 | ISC | js |
| smol-toml | 1.4.2 | BSD-3-Clause | js |
| standardwebhooks | 1.1.1 | MIT | js |
| ts-algebra | 2.0.0 | MIT | js |
| tslib | 2.8.1 | 0BSD | js |
| typebox | 1.3.27 | MIT | js |
| undici-types | 7.16.0 | MIT | js |
| web-streams-polyfill | 3.3.3 | MIT | js |
| ws | 8.22.0 | MIT | js |
| Tilde | 0.1.0 | MIT | native |
| Tilde icon | 0.1.0 | MIT | asset |
| Node system runtime | 24.22.1 qualification; compatibility floor 22.19.0 | MIT | dynamic-system |
| libQt6Core.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| libQt6DBus.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| libQt6Gui.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| libQt6Network.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| libQt6OpenGL.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| libQt6Qml.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| libQt6QmlMeta.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| libQt6QmlModels.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| libQt6QmlWorkerScript.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| libQt6Quick.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| libQt6QuickControls2.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| libQt6QuickTemplates2.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| libQt6Widgets.so.6 | 6.12.0 qualification; minimum 6.8 | LGPL-3.0-only | dynamic-system |
| @silvia-odwyer/photon embedded WebAssembly | 0.3.3 | Apache-2.0 | static-wasm |
| Roboto Regular embedded font | 2.137 | Apache-2.0 | embedded-asset |
| Photon dependency/build notice: ab_glyph_rasterizer | 0.1.5 | Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: adler2 | 2.0.0 | 0BSD OR MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: approx | 0.5.1 | Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: autocfg | 1.1.0 | Apache-2.0 OR MIT | source-build-notice-superset |
| Photon dependency/build notice: base64 | 0.13.0 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: bitflags | 1.3.2 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: bumpalo | 3.10.0 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: bytemuck | 1.11.0 | Zlib OR Apache-2.0 OR MIT | source-build-notice-superset |
| Photon dependency/build notice: byteorder | 1.4.3 | Unlicense OR MIT | source-build-notice-superset |
| Photon dependency/build notice: cfg-if | 0.1.10 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: cfg-if | 1.0.0 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: color_quant | 1.1.0 | MIT | source-build-notice-superset |
| Photon dependency/build notice: console_error_panic_hook | 0.1.7 | Apache-2.0/MIT | source-build-notice-superset |
| Photon dependency/build notice: conv | 0.3.3 | MIT | source-build-notice-superset |
| Photon dependency/build notice: crc32fast | 1.3.2 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: custom_derive | 0.1.7 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: deranged | 0.3.8 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: either | 1.7.0 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: fdeflate | 0.3.6 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: find-crate | 0.6.3 | Apache-2.0 OR MIT | source-build-notice-superset |
| Photon dependency/build notice: flate2 | 1.0.34 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: getrandom | 0.1.16 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: getrandom | 0.2.7 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: gif | 0.13.1 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: image | 0.24.9 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: imageproc | 0.23.0 | MIT | source-build-notice-superset |
| Photon dependency/build notice: instant | 0.1.13 | BSD-3-Clause | source-build-notice-superset |
| Photon dependency/build notice: itertools | 0.10.3 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: jpeg-decoder | 0.3.1 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: js-sys | 0.3.62 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: libc | 0.2.126 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: log | 0.4.17 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: matrixmultiply | 0.3.9 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: miniz_oxide | 0.8.0 | MIT OR Zlib OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: nalgebra | 0.30.1 | BSD-3-Clause | source-build-notice-superset |
| Photon dependency/build notice: node-sys | 0.4.2 | Apache-2.0 OR MIT | source-build-notice-superset |
| Photon dependency/build notice: num | 0.4.3 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: num-bigint | 0.4.6 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: num-complex | 0.4.6 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: num-integer | 0.1.46 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: num-iter | 0.1.45 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: num-rational | 0.4.2 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: num-traits | 0.2.19 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: once_cell | 1.13.0 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: owned_ttf_parser | 0.6.0 | Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: palette | 0.6.1 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: palette_derive | 0.6.1 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: paste | 1.0.15 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: perlin2d | 0.2.6 | Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: phf | 0.11.0 | MIT | source-build-notice-superset |
| Photon dependency/build notice: phf_generator | 0.11.0 | MIT | source-build-notice-superset |
| Photon dependency/build notice: phf_macros | 0.11.0 | MIT | source-build-notice-superset |
| Photon dependency/build notice: phf_shared | 0.11.0 | MIT | source-build-notice-superset |
| Photon dependency/build notice: png | 0.17.14 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: ppv-lite86 | 0.2.16 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: proc-macro2 | 1.0.67 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: quote | 1.0.33 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: rand | 0.7.3 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: rand | 0.8.5 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: rand_chacha | 0.2.2 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: rand_chacha | 0.3.1 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: rand_core | 0.5.1 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: rand_core | 0.6.3 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: rand_distr | 0.2.2 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: rawpointer | 0.2.1 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: rusttype | 0.9.2 | MIT / Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: safe_arch | 0.7.2 | Zlib OR Apache-2.0 OR MIT | source-build-notice-superset |
| Photon dependency/build notice: serde | 1.0.188 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: serde_derive | 1.0.188 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: simba | 0.7.3 | Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: simd-adler32 | 0.3.7 | MIT | source-build-notice-superset |
| Photon dependency/build notice: siphasher | 0.3.10 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: syn | 1.0.98 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: syn | 2.0.37 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: thiserror | 1.0.31 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: thiserror-impl | 1.0.31 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: tiff | 0.9.1 | MIT | source-build-notice-superset |
| Photon dependency/build notice: time | 0.3.28 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: time-core | 0.1.1 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: toml | 0.5.9 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: ttf-parser | 0.6.2 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: typenum | 1.17.0 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: unicode-ident | 1.0.2 | (MIT OR Apache-2.0) AND Unicode-DFS-2016 | source-build-notice-superset |
| Photon dependency/build notice: wasm-bindgen | 0.2.95 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: wasm-bindgen-backend | 0.2.95 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: wasm-bindgen-macro | 0.2.95 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: wasm-bindgen-macro-support | 0.2.95 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: wasm-bindgen-shared | 0.2.95 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: web-sys | 0.3.55 | MIT/Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: weezl | 0.1.8 | MIT OR Apache-2.0 | source-build-notice-superset |
| Photon dependency/build notice: wide | 0.7.28 | Zlib OR Apache-2.0 OR MIT | source-build-notice-superset |
| Rust standard library in Photon | 1.86.0-nightly (3f43b1a63 2025-01-03) | MIT OR Apache-2.0 | static-runtime |
| Rust standard-library source/build notice: addr2line | 0.22.0 | Apache-2.0 OR MIT | source-build-notice-superset |
| Rust standard-library source/build notice: adler | 1.0.2 | 0BSD OR MIT OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: allocator-api2 | 0.2.21 | MIT OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: cc | 1.2.0 | MIT OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: cfg-if | 1.0.0 | MIT/Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: compiler_builtins | 0.1.140 | MIT AND Apache-2.0 WITH LLVM-exception AND (MIT OR Apache-2.0) | source-build-notice-superset |
| Rust standard-library source/build notice: dlmalloc | 0.2.7 | MIT/Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: getopts | 0.2.21 | MIT/Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: gimli | 0.29.0 | MIT OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: gimli | 0.31.1 | MIT OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: hashbrown | 0.15.2 | MIT OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: libc | 0.2.169 | MIT OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: memchr | 2.7.4 | Unlicense OR MIT | source-build-notice-superset |
| Rust standard-library source/build notice: miniz_oxide | 0.7.4 | MIT OR Zlib OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: object | 0.36.7 | Apache-2.0 OR MIT | source-build-notice-superset |
| Rust standard-library source/build notice: rand | 0.8.5 | MIT OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: rand_core | 0.6.4 | MIT OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: rand_xorshift | 0.3.0 | MIT OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: rustc-demangle | 0.1.24 | MIT/Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: shlex | 1.3.0 | MIT OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: unicode-width | 0.1.14 | MIT OR Apache-2.0 | source-build-notice-superset |
| Rust standard-library source/build notice: unwinding | 0.2.5 | MIT OR Apache-2.0 | source-build-notice-superset |
| quickjs-wasi embedded WebAssembly | 3.6.2 | MIT | static-wasm |
| QuickJS-NG | git 6d46d07d04041b40f4f49eaa7fdebe44c314c699 | MIT | static-wasm-dependency |
| Unicode data in QuickJS | as vendored at 6d46d07d04041b40f4f49eaa7fdebe44c314c699 | Unicode-3.0 | embedded-data |
| Ada URL/IDNA parser | 3.4.3 | MIT OR Apache-2.0 | static-wasm-dependency |
| MbedTLS / TF-PSA-Crypto | vendored at 5a7a0eeda87c99542f8cf3095b6d61ecfa755977 | Apache-2.0 | static-wasm-dependency |
| WASI libc and allocator notice set | SDK32; git 2fc32bc81b9f07f8d9525edea59bfbaf760c06d6 | MIT AND Apache-2.0 AND (Apache-2.0 WITH LLVM-exception) AND BSD-2-Clause AND BSD-3-Clause AND CC0-1.0 | static-runtime-notice-superset |
| WASI SDK LLVM runtimes | SDK32; git 4434dabb69916856b824f68a64b029c67175e532 | Apache-2.0 WITH LLVM-exception | static-runtime-notice-superset |

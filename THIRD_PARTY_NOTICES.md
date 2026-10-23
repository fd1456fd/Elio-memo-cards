# Third-party components and licenses

Elio Memo Cards code, original documentation, HTML/CSS and examples are covered by the root [MIT License](LICENSE). That license does not replace the licenses of the components below.

## Files included in this source package

| Component | Version / source | License | Included notices |
|---|---|---|---|
| Noto Sans CJK SC Regular and Bold | Sans2.004, commit `523d033d6cb47f4a80c58a35753646f5c3608a78` | SIL OFL 1.1 | `assets/fonts/LICENSE.txt`, `COPYRIGHT.json`, `SOURCE.json` |

The unmodified fonts contain the copyright notice “© 2014-2021 Adobe (http://www.adobe.com/).” Their exact file hashes and upstream URLs are recorded in `SOURCE.json`. They are included under OFL, not MIT. No system font files or external icon packs are included. The card interface and geometric title rule were written for this project.

## npm dependencies installed separately

| Component | Locked version | License | Upstream |
|---|---|---|---|
| Playwright | 1.62.1 | Apache-2.0 | [microsoft/playwright](https://github.com/microsoft/playwright/tree/v1.62.1) |
| playwright-core | 1.62.1 | Apache-2.0 | [microsoft/playwright](https://github.com/microsoft/playwright/tree/v1.62.1) |
| fsevents, optional on macOS | 2.3.2 | MIT | [fsevents/fsevents](https://github.com/fsevents/fsevents/tree/v2.3.2) |

The source package includes the Apache license, Playwright NOTICE and third-party notice pointers, and fsevents license in `licenses/` for reference. `package-lock.json` pins the npm package versions and integrity values. No `node_modules` files are distributed in this source package.

Playwright itself includes bundled third-party modules. Its installed package contains adjacent `*.js.LICENSE` files; see the copied `Playwright-ThirdPartyNotices.txt` and `Playwright-core-ThirdPartyNotices.txt` for details. Those bundles retain their individual licenses. Anyone who later vendors or redistributes the installed dependencies must preserve their full upstream notices, not just this summary.

## External runtimes

- Node.js: the main project is MIT, with third-party components under their own licenses. See the [Node.js v24.21.0 license](https://github.com/nodejs/node/blob/v24.21.0/LICENSE). The Node executable is not distributed here.
- Chromium Headless Shell: installed separately by Playwright. The tested build is 151.0.7922.34 (Playwright build 1234). Its `LICENSE.headless_shell` includes Chromium and third-party notices; retain that file if redistributing the browser. The browser executable and FFmpeg downloaded by the installer are not distributed here. This tool renders images and does not invoke FFmpeg. See [Playwright browser installation](https://playwright.dev/docs/browsers) and the [Chromium project](https://www.chromium.org/chromium-projects/).

The tool does not use a paid model API, proprietary SDK, Apple UI asset pack, or copied system font. It verifies that card text uses the bundled font and rejects characters that require an additional system font. Names of upstream projects and their authors identify sources; they do not imply endorsement.

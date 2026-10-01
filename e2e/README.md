# End-to-end smoke test

`npm run e2e` builds the app in debug mode and runs `smoke.mjs`: the app starts with a throwaway
profile (`OTAKUSOUL_HOME` in a temp folder, so real chats and settings stay untouched, even with
OtakuSoul open) and talks to a mock LLM (`mock-llm.mjs`) instead of a model. The test chats until
older messages leave the context window, then checks the context meter, the automatic summary in
the chat sidebar and that the summary reaches the system prompt. Screenshots land in
`e2e/screenshots/`. `npm run e2e:run` skips the build.

Requirements (Linux; Windows works with `msedgedriver`, macOS has no WebDriver for WKWebView):

- `cargo install tauri-driver --locked`
- `WebKitWebDriver`: Arch `webkitgtk-6.0`, Debian/Ubuntu `webkit2gtk-driver`, Fedora `webkitgtk6.0`
- A display; headless CI runs it under `xvfb-run npm run e2e`.

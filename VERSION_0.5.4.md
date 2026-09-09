# AI Media Network Operator v0.5.4

- Ignores expired/stale Telegram callback-query acknowledgements instead of returning HTTP 500.
- Keeps processing the underlying callback action when possible.
- Preserves webhook mode, renderer, branding assets and format-specific templates from v0.5.3.

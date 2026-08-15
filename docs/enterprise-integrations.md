# Enterprise integrations and OTIO handoff

`previewOtioHandoff` is a conservative local review artifact. It analyzes an existing OTIO timeline, inventories only `file:` media references under caller-supplied roots, and can checksum bounded regular files. It never writes OTIO, downloads remote media, resolves symlinks, or claims an Avid import will work. Effects, transitions, retimes, nested timelines, relinking, and multichannel audio require a real Media Composer round trip.

`CtmsReadClient` is session-scoped and read-only. It starts from an explicitly allowlisted HTTPS registry endpoint, discovers HAL relations, caches links only in the object instance, bounds response bodies, and strips credential-like fields from returned bodies. The bearer token is used only in the request header and is never returned.

AMA, AMT, AVX, AAX, NEXIS, and Distributed Processing diagnostics only distinguish local installation evidence from public documentation or provider-gated surfaces. They do not confer SDK rights or perform storage, editorial, or plug-in mutations. A version associated with any other Avid product is explicitly rejected as evidence for Media Composer.

# Color-adapter input references

Saved timeline inspection can expose `effect.inputReference` for the observed `EFF2_LUTSFX` structure. This describes the effect's saved input clip, separately from the opaque effect node. It does not promote that input to a verified rendered source range.

Recognition requires the bounded single-linear-LUT declaration, a picture effect with non-reversed/zero mode/scalar flags, exactly one input track with index 1, and a picture sequence of the same rate and length. That sequence must contain exactly one full-length picture SourceClip, with at most two zero-length fillers. Nested effects, transitions, extra clips, rate/length mismatches, nonzero fillers and unsupported color payloads do not receive an input reference. Source bounds clip the declared input to the captured mob range.

`avid_trace_saved_sources` may follow this reference diagnostically. It marks the step `effectInputOnly: true` and explicitly states that rendered output correspondence is unverified. The whole trace stays `incomplete: true`, even if later references resolve. Normal scope, source bounds, cycle, rate, overlap and depth guards still apply. The original TKFX node remains opaque; general range/source-usage consumers do not receive a fabricated top-level SourceClip reference.

The actual refreshed Sonoma fixture passed snapshot capture, reconnect and a range query spanning the cut. Its two input references declare source starts 2850 and 3300 at 30 fps, each for 60 frames. Tracing composition range [30,90) returned [2880,2910) and [3300,3330) input intervals, marked incomplete. Evidence: `.avid-mcp-analysis/saved-color-effects-61e132e4-2905-49ce-bd55-4fb7204fa85c/evidence.json`; the retained bin hash stayed unchanged.

Tests reject reverse/mode/scalar flags, nested effects, mismatched rates/lengths, sound inputs, extra clips and nonzero filler lengths. This does not qualify arbitrary LUT/effect timing, input-to-output color math, physical source identity, playback, native refresh automation or general timeline editing.

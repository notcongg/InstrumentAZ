# InstrumentAZ — brand system draft

## Product identity
**InstrumentAZ** is a violin-first engineering workspace connecting instrument ideas to measured, manufacturable designs. The voice is precise, patient, workshop-aware and explicit about uncertainty.

## Three symbol concepts
1. **String A — primary recommendation.** An architectural A built from two structural lines, a crossbar, a string/bridge cue and a small resonance point. Recognizable at small app-icon sizes and appropriate to the engineering product.
2. **Workshop monogram.** A framed IA/Z letterform with tool-like diagonal strokes. More software-forward; the rounded frame can feel like an instrument control panel.
3. **Resonance lines.** A violin-body silhouette with symmetric modal paths. Strongest association with the instrument, but more detailed and less legible at favicon scale.

**Recommended direction:** use String A for the primary mark; use resonance lines for splash/artwork and the monogram for secondary event or community use. `instrumentaz-mark.svg` is the primary source; `instrumentaz-horizontal.svg` is the dark-surface lockup.

## Color palette
| Token | Hex | Purpose |
|---|---:|---|
| Workshop charcoal | `#111314` | Main application background |
| Forged graphite | `#191B1D` | Panels and project chrome |
| Warm brass | `#E5A45C` | Brand and selected engineering controls |
| Pale amber | `#F2C78D` | Focused highlights |
| Resonance teal | `#7FBAC1` | Calculated / derived information |
| Signal green | `#86C398` | Saved / connection-ready state |
| Ash white | `#E8E8E3` | Primary text on dark backgrounds |
| Quiet grey | `#6F7472` | Secondary labels and notes |

Light mode uses paper `#F7F8F6`, graphite `#1E2423`, and a darker brass `#A96622` for text contrast.

## Typography
- **UI / wordmark:** Inter, then Segoe UI, system sans-serif. Keep engineering numbers tabular and labels compact.
- **Code / identifiers:** a future editor should use a readable monospace family such as Cascadia Code.
- Do not set tolerances or material specifications in display-only typography; show units beside every value.

## Product language
Mark the provenance of outputs as **visual**, **calculated**, **approximate**, **validated**, or **measured**. Never use “validated” for the current ideal-string model. Do not describe the SVG preview as CAD or production geometry.

## Asset notes
All supplied brand marks are original, editable SVG source. PNG raster exports, Windows ICO, an installed application splash implementation, localized variants and detailed accessibility testing remain packaging work for the future Windows-native build.

# Design QA — Web 页面与交互原型

## Metadata

- Reference: `https://shadcn-admin.netlify.app/`
- Implementation: `http://localhost:4174/`
- Reference screenshot: `design-evidence/reference-shadcn-admin-desktop.png`
- Implementation screenshots:
  - `design-evidence/implementation-desktop-closed.png`
  - `design-evidence/implementation-desktop-open.png`
  - `design-evidence/implementation-mobile-open.png`
  - `design-evidence/source-config-variant-a.png`
  - `design-evidence/source-platform-providers.png`
- Combined comparison: `design-evidence/comparison-desktop.jpg`
- Viewports checked: desktop 1280 × 720, mobile 390 × 844
- Checked on: 2026-09-13

## Comparison

| Surface | Result | Notes |
| --- | --- | --- |
| Typography | Pass | Reuses the reference project font stack, heading scale, and text hierarchy. |
| Spacing and layout | Pass | Keeps the reference sidebar/header rhythm; content workspace uses the approved resizable master-detail layout. |
| Colors and tokens | Pass | Reuses the reference shadcn/Tailwind tokens; green score and red junk action are intentional semantic accents. |
| Images and media | Pass | Video cover is constrained and does not cause layout shift; text-only content does not invent imagery. |
| Copy and states | Pass | Chinese labels reflect AI Radar terminology and include completed, waiting, failed, deleted, junk, and utilization states. |
| Responsive behavior | Pass | Desktop opens a draggable split; mobile opens a full-screen detail and keeps all six actions visible with text labels. |

## Interaction checks

- Detail is closed on initial entry.
- Selecting a content card opens detail; close button and `Esc` restore the full list.
- Desktop split has two panels and a draggable separator; saved width is restored.
- Previous/next buttons and arrow or `J`/`K` navigation switch content.
- Score exposes the total directly and the score breakdown through the detail analysis area.
- Mobile detail keeps 收藏、卡片、视频、文章、项目、垃圾 actions fixed at the bottom.
- All Content supports per-item selection and safe batch actions; batch delete is absent.

## Findings and resolution history

| Priority | Finding | Resolution |
| --- | --- | --- |
| P2 | Template developer tools were visible in the prototype shell. | Removed from the AI Radar root layout and regenerated evidence. |
| P2 | Mobile bottom actions originally used icons without enough visible meaning. | Added compact Chinese text labels and verified at 390 × 844. |
| P3 | Production bundle still contains unused template demo routes. | Accepted for this throwaway prototype; production implementation will remove them. |

## Source and configuration prototype

- Three structural variants were compared on `/sources?variant=A|B|C`: master-detail workspace, platform health board, and parameter inheritance tree.
- The confirmed direction uses variant A as the shell and incorporates variant C's explicit effective-value and inheritance-source display.
- Source management and platform-wide provider routing are separate tabs so a provider order cannot be mistaken for a single-source setting.
- Source detail exposes overview, effective capture parameters, effective provider route, version history, test-fetch preview, and enable state.
- Provider secrets remain masked; the prototype offers replacement and connection testing without revealing stored values.
- Configuration save opens a change comparison and creates a new version; operational actions report results without creating parameter versions.
- Batch configuration, source status, fixed-rule read-only state, and audit entry points remain visible in the same workspace.

### Source configuration findings

| Priority | Finding | Resolution |
| --- | --- | --- |
| P2 | The first draft placed editable provider ordering inside a selected source, implying source ownership. | Split platform providers into a dedicated tab and left only the effective route in source detail. |
| P2 | The first draft saved directly without showing the affected scope. | Added a pre-save comparison with changed value, affected source count, and new version. |
| P3 | The three-way variant switcher appears only in development. | Intentional prototype behavior; the production build cannot accidentally expose it. |

## Verification

- `pnpm lint`: passed
- `pnpm build`: passed
- Browser interaction and visual checks: passed
- Known non-blocking warning: Vite reports large inherited template chunks; production implementation should remove unused demo modules and split routes.

## Final result

**passed** — no unresolved P0, P1, or P2 findings.

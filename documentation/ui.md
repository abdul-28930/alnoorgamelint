# Gaming-Centre UI Component Library

_Theme — “Neo-Noir Cyberpunk”_
Font stack: `"Rajdhani", "Segoe UI", "Roboto", sans-serif`
(“Rajdhani” is the Google-hosted font used on [https://www.cyberpunk.net](https://www.cyberpunk.net) for headings; it pairs well with condensed uppercase neon styling.)

## 0. Theme Tokens

| Token                 | Value                               | Notes                         |
| --------------------- | ----------------------------------- | ----------------------------- |
| `--cp-yellow`       | `#FCEE0D`                         | Primary neon highlight        |
| `--cp-cyan`         | `#00FFF7`                         | CTA hover / secondary accents |
| `--cp-magenta`      | `#9413FF`                         | Accent gradient end           |
| `--cp-black`        | `#0D0D0D`                         | Global background             |
| `--cp-gray`         | `#101820`                         | Card backgrounds              |
| `--radius-angle`    | `6px`                             | For angled corner clip-path   |
| `--transition-fast` | `200ms cubic-bezier(0.4,0,0.2,1)` | Default micro-interaction     |
| `--glow`            | `0 0 8px var(--cp-yellow)`        | Re-usable box-shadow          |

Typography scale (Rajdhani, uppercase headings)

```text
Display-XL   4.5rem / 700 / -1% tracking  
Display-L    3.5rem / 700 / -1%  
Display-M    2.5rem / 600  
Heading-L    1.875rem / 600  
Heading-M    1.5rem / 600  
Body-M       1rem / 400  
Caption      0.875rem / 400 / 8% tracking
```

---

## 1. **`<NavBar />`**

| Property        | Spec                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Height          | `80px` fixed, sticky top, z-index `50`                                                                                                                           |
| Background      | `rgba(13,13,13,0.85)` with **blur(6px)** (backdrop-filter)                                                                                                   |
| Logo            | Left,`height: 40px`, links to `/`                                                                                                                                |
| Links           | Flex row, gap `32px`, uppercase, weight `600`, color white → hover: `--cp-yellow` glow underline (`border-image: linear-gradient(90deg,#FCEE0D,#FCEE0D)` 1) |
| Active State    | Neon angled outline (`clip-path: polygon(...)`)                                                                                                                    |
| Language Switch | Dropdown chevron, matches link styling                                                                                                                               |
| Mobile          | Hamburger morphs to full-screen overlay, slide-in from right, uses same link tokens                                                                                  |

---

## 2. **`<HeroBanner />`**

| Area         | Spec                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Layout       | Full-viewport (`height: 100vh`), `position: relative`                                                              |
| Background   | Poster image**or** looping MP4/video; overlay gradient `linear-gradient(180deg,transparent 60%,#0D0D0D 100%)`  |
| Headline     | Display-XL,`text-shadow: var(--glow)`                                                                                |
| Sub-headline | Heading-M, cyan accent highlights `<span class="text-cp-cyan">keywords</span>`                                       |
| CTAs         | Two **`<NeonButton />`**s (primary yellow, secondary transparent) horizontally aligned on desktop, stacked on mobile |
| Animation    | Fade-in + slight upward translate `@keyframes fadeRise` over `700ms` delay chain                                   |

---

## 3. **`<NeonButton variant="primary|secondary" />`**

| Attribute     | Primary                                                                                                                                                                   | Secondary                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Shape         | Angled: use `clip-path: polygon(0 0,calc(100% - var(--radius-angle)) 0,100% var(--radius-angle),100% 100%,var(--radius-angle) 100%,0 calc(100% - var(--radius-angle)))` |                                                         |
| Fill          | `--cp-yellow`                                                                                                                                                           | transparent                                             |
| Border        | 2px `--cp-yellow`                                                                                                                                                       | 2px `--cp-yellow`                                     |
| Text          | `#0D0D0D`, bold                                                                                                                                                         | `--cp-yellow`, bold                                   |
| Hover / Focus | Box-shadow glow (`var(--glow)`), scale `1.03`                                                                                                                         | fill slides in from left (pseudo-element width 0→100%) |
| Disabled      | `opacity: .4`, cursor `not-allowed`, no glow                                                                                                                          |                                                         |

---

## 4. **`<SectionDivider angle="top|bottom" />`**

CSS: `transform: skewY(-3deg)` (top) or `skewY(3deg)` (bottom)
Height: `120px`; background gradient `var(--cp-yellow) → transparent` or cyan/magenta variant.

---

## 5. **`<InfoCard />`**

| Spec       | Value                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Width      | Responsive `clamp(280px, 31vw, 380px)`                                                                                        |
| Border     | 1px solid `rgba(255,255,255,0.08)` + **inner neon edge** via `box-shadow: inset 0 0 0 2px var(--cp-cyan)` (opacity 0) |
| Hover      | Inner edge opacity `1`, translateY `-4px`                                                                                   |
| Background | `--cp-gray` with subtle noise texture (`background-blend-mode: overlay`)                                                    |
| Content    | Thumbnail top (16:9), heading (Heading-M), body (Body-M)                                                                        |
| Corner     | Same angled `clip-path` as buttons                                                                                            |

---

## 6. **`<Carousel />`**

• Snap-scroll (`scroll-snap-type: x mandatory`) with no external lib.
• Each slide is an `<InfoCard />`.
• Mouse wheel → horizontal scroll via `scroll-behavior: smooth`.
• Prev / Next arrow buttons = `<NeonButton variant="secondary" />` absolute center-Y.

---

## 7. **`<NewsTile />`** (grid or list)

| Element   | Style                                                                                           |
| --------- | ----------------------------------------------------------------------------------------------- |
| Tag       | `caption`, neon-yellow bracketed “NEWS_” prefix                                             |
| Date      | Upper-right,`caption`, cyan                                                                   |
| Title     | Heading-M, clamp lines with ellipsis                                                            |
| Thumbnail | Aspect 16:9, thin cyan border, hover: scale 1.02 + magenta overlay (`mix-blend-mode: screen`) |

---

## 8. **`<NeonInput />` & `<NeonSelect />`**

| Property    | Spec                                                         |
| ----------- | ------------------------------------------------------------ |
| Border      | 1px solid `#555` default → focus: 2px `--cp-cyan`, glow |
| Background  | `rgba(16,24,32,.6)`                                        |
| Placeholder | `rgba(255,255,255,.4)`                                     |
| Validation  | Error border `--cp-magenta` + shake animation keyframe     |

---

## 9. **`<Footer />`**

Dark block (`background: #080B0F`) with angled top divider.
Three columns on desktop (About, Quick Links, Social); stack on mobile.
Headings use `Heading-M` cyan; links neon-yellow hover underline.
Bottom legal bar 1px top border `rgba(255,255,255,.1)`.

---

## 10. **Motion & Micro-interactions**

| Name             | Keyframe / Utility                                                             | Usage                              |
| ---------------- | ------------------------------------------------------------------------------ | ---------------------------------- |
| `fadeRise`     | `0% {opacity:0; transform:translateY(20px)} 100%{opacity:1; transform:none}` | Hero content, cards on scroll      |
| `tilt` (hover) | `rotateY(var(--tilt-x)) rotateX(var(--tilt-y))` via JS                       | Carousel cards                     |
| `glitch`       | Two pseudo elements shifting `translateX(1px)` & `clip-path`               | Headlines/Hover states (sparingly) |

---

## 11. **Breakpoints**

| Token   | Width  |
| ------- | ------ |
| `sm`  | 640px  |
| `md`  | 768px  |
| `lg`  | 1024px |
| `xl`  | 1280px |
| `2xl` | 1536px |

Ensure every component has **single-source styles** (Tailwind plugin or SCSS modules); never override per-page.

---

## 12. **Accessibility Checklist**

1. All CTAs have discernible text (`aria-label` if icon only).
2. Contrast ratio ≥ 4.5:1 for body text, ≥ 3:1 for large headings against `--cp-black`.
3. Keyboard focus ring: 2px cyan outline in addition to box-shadow glow.
4. Prefers-reduced-motion → disable `glitch`, shorten `fadeRise` to `0ms`.

---

## 13. **Additional Buttons & Interactive Controls**

### 13.1 `<NeonIconButton size="sm|md|lg" />`

| Property | Spec                                                                          |
| -------- | ----------------------------------------------------------------------------- |
| Shape    | Perfect circle; sizes:`sm 40px`, `md 48px`, `lg 56px`                   |
| Fill     | Transparent by default; on hover**fill** slides in cyan (`--cp-cyan`) |
| Icon     | Centered SVG `24px` (smaller size scales 80 %)                              |
| Border   | 2px `--cp-yellow`; hover → box-shadow `var(--glow)`                      |
| Focus    | 2px outline `--cp-cyan` + ring glow                                         |
| Disabled | `opacity:.3`, pointer-events none                                           |

### 13.2 `<NeonGhostButton />`

A tertiary option for subtle actions (e.g., _View details_ links).

| Attribute  | Value                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| Text       | `--cp-yellow`, weight 500                                              |
| Background | Transparent                                                              |
| Border     | none                                                                     |
| Hover      | Underline animates `scaleX(0→1)` in `--cp-yellow`; text-shadow glow |
| Active     | Text `--cp-cyan`                                                       |

### 13.3 `<ToggleSwitch />`

Slider style switch for settings (24 h format, dark mode override, etc.)

| Piece      | Spec                                                                                |
| ---------- | ----------------------------------------------------------------------------------- |
| Track      | Width `44px`, height `24px`, radius `9999px`, background `#555`             |
| Thumb      | Diameter `18px`, translateX `2px → 22px` when checked, fill `--cp-yellow`    |
| Focus Ring | 2px `--cp-cyan` outline                                                           |
| Animation  | `transition: transform var(--transition-fast), background var(--transition-fast)` |

### 13.4 `<Tabs />`

Horizontal tab bar for dashboard sections.

| Property  | Spec                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| Container | Flex row, gap `24px`, border-bottom 1px `rgba(255,255,255,.08)`           |
| Tab       | Padding `12px 0`, uppercase, font-weight 600                                |
| Active    | Border-image angled underline in `--cp-yellow` (same trick as NavBar links) |
| Hover     | Text `--cp-cyan`                                                            |

---

## 14. **Global Scrollbar Styling**

(works for WebKit and Firefox, optional via Tailwind plugin)

| Selector                      | Declaration                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `::-webkit-scrollbar`       | width:`8px`, height: `8px`                                                                                    |
| `::-webkit-scrollbar-track` | background:`#1A1A1A`                                                                                            |
| `::-webkit-scrollbar-thumb` | background:`linear-gradient(180deg,#FCEE0D,#00FFF7)`; border-radius: `4px`; box-shadow: `0 0 6px #FCEE0D80` |
| `scrollbar-color` (Firefox) | `#FCEE0D #1A1A1A`                                                                                               |

---

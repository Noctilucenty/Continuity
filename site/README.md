# Continuity — Marketing Site

A single-page, Apple-keynote-style animated landing site for **Continuity**, the
persistent intelligence layer for AI-powered work.

It's pure static HTML/CSS/JS — **no build step, no dependencies**.

## Run locally

Any static file server works. From this `site/` folder:

```bash
python3 -m http.server 4600
# then open http://localhost:4600
```

or

```bash
npx serve .
```

Or just open `index.html` directly in a browser.

## Structure

```
site/
├── index.html      # all sections & inline SVG logo mark
├── css/style.css   # design system + every animation
└── js/main.js      # particles, scroll reveals, count-ups, cursor glow,
                    # magnetic buttons, 3D tilt, parallax
```

## What's inside

- Animated gradient **hourglass logo** (inline SVG, brand colors)
- Interactive **particle constellation** background (canvas)
- Drifting **mesh-gradient blobs** + film grain
- **Scroll-reveal** animations on every section (IntersectionObserver)
- Animated **count-up** statistics
- **Cursor glow**, **magnetic buttons**, and **3D card tilt** (pointer devices)
- Animated **knowledge-graph** and rotating **autonomous-run loop**
- macOS-style **syntax-highlighted terminal**
- Fully responsive + honors `prefers-reduced-motion`

## Content

Messaging is adapted from *Continuity — The Persistent Intelligence Layer for
AI-Powered Work*.

# Stroke Options

This note demonstrates the SVG stroke styling options for sparklines.

---

## 1. Line Cap Styles

The `cap` option controls how line ends are drawn.

| Style | Example |
|-------|---------|
| Round (default) | `sparkline: [1 3 2 5 4] cap=round width=150` |
| Butt | `sparkline: [1 3 2 5 4] cap=butt width=150` |
| Square | `sparkline: [1 3 2 5 4] cap=square width=150` |

With thicker lines the difference is more visible:

- Round: `sparkline: [1 5 2 4 3] cap=round line-width=4 width=120`
- Butt: `sparkline: [1 5 2 4 3] cap=butt line-width=4 width=120`
- Square: `sparkline: [1 5 2 4 3] cap=square line-width=4 width=120`

---

## 2. Line Join Styles

The `join` option controls how corners are drawn where line segments meet.

| Style | Example |
|-------|---------|
| Round (default) | `sparkline: [1 5 1 5 1] join=round line-width=3 width=150` |
| Miter | `sparkline: [1 5 1 5 1] join=miter line-width=3 width=150` |
| Bevel | `sparkline: [1 5 1 5 1] join=bevel line-width=3 width=150` |

---

## 3. Dash Patterns

The `dash` option creates dashed or dotted lines. Values are comma-separated lengths (dash, gap, dash, gap...).

| Pattern | Example |
|---------|---------|
| Solid (default) | `sparkline: [1 2 3 4 5 4 3 2 1] width=150` |
| Simple dash | `sparkline: [1 2 3 4 5 4 3 2 1] dash="5,5" width=150` |
| Short dash | `sparkline: [1 2 3 4 5 4 3 2 1] dash="3,3" width=150` |
| Dotted | `sparkline: [1 2 3 4 5 4 3 2 1] dash="1,3" width=150` |
| Complex | `sparkline: [1 2 3 4 5 4 3 2 1] dash="10,3,2,3" width=150` |

---

## 4. Combined Options

All stroke options can be combined:

Dashed with square caps: `sparkline: [1 3 5 3 1 3 5] dash="8,4" cap=square color="blue" width=180`

Dotted with round join: `sparkline: [2 5 2 5 2 5 2] dash="2,4" join=round line-width=2 color="green" width=180`

Sharp corners: `sparkline: [1 5 1 5 1 5 1] join=miter cap=butt line-width=2 color="red" width=180`

---

## 5. SVG Attribute Names

You can also use full SVG attribute names:

- `stroke-linecap=butt` same as `cap=butt`
- `stroke-linejoin=bevel` same as `join=bevel`
- `stroke-dasharray="5,3"` same as `dash="5,3"`

Example: `sparkline: [1 2 3 4 5] stroke-linecap=square stroke-linejoin=miter stroke-dasharray="4,2" line-width=2 width=150`

---

## Option Aliases

| Short | Aliases |
|-------|---------|
| `cap` | `linecap`, `line-cap`, `stroke-linecap` |
| `join` | `linejoin`, `line-join`, `stroke-linejoin` |
| `dash` | `dasharray`, `dash-array`, `stroke-dasharray` |

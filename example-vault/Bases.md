# Dashboard

This example demonstrates the Bases integration for the Sparklines plugin. The `[@bases:BaseName:column]` syntax pulls data from an Obsidian Bases table. Data is sorted according to the base's sort configuration. When the sorting options are changed the sparklines are updated after a click anywhere into the note.

## Tracker Base

![[Tracker.base]]

### Steps Trend
`sparkline: [@bases:Tracker:steps] color="red" line-width=3 width=200`
### Mood Trend
`sparkline: [@bases:Tracker:mood] color="blue" line-width=3 width=200`
### Calories Trend
`sparkline: [@bases:Tracker:calories] color=green line-width=3 width=200`

---
## Syntax

```
sparkline: [@bases:BaseName:column] <options>
```

- **BaseName**: The name of the `.base` file (without extension), can include path.
- **column**: The property/column to extract numeric data from.
- **options**: The key/value pairs for styling the sparkline.

The sparkline will display values from all files matching the base's filter, sorted according to the base's sort configuration.

---
## Alternative: Frontmatter Data

You can also reference data directly from the current note's frontmatter, see [[Properties]]:

```yaml
---
weekly_steps: 8500, 12000, 6200, 9800, 11500, 14200, 5400
weekly_mood: 7, 8, 5, 7, 8, 9, 6
---
```

Then reference it with:
- `sparkline: [@weekly_steps] color="green"`
- `sparkline: [@weekly_mood] color="blue"`

---
## File Structure

```
Data/
	2025-01-13.md   # Daily notes with
	2025-01-14.md   #   steps, calories,
	2025-01-15.md   #   and mood data
	2025-01-16.md   #   in frontmatter
	2025-01-17.md
	2025-01-18.md
	2025-01-19.md
Bases.md            # This file
Tracker.base        # Bases definition
```

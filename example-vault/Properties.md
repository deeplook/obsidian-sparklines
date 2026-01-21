---
stats: 10, 25, 15, 30, 20, 35, 25
weekly_steps: 8000, 9500, 7200, 10000, 8500, 12000, 9000
temperatures: 72, 75, 71, 68, 70, 73, 74
revenue: 100, 120, 95, 140, 130, 150, 145
---
# Dynamic Sparkline Test

This note shows sparklines with dynamic data pulled from frontmatter properties.

## 1. Basic Frontmatter Reference

My stats: `sparkline: [@stats] color="blue"`

## 2. Explicit Frontmatter Source

Weekly steps: `sparkline: [@frontmatter:weekly_steps] color="green" width=150`

## 3. Another Example

Temperatures: `sparkline: [@temperatures] color="orange"`

## 4. With Options

Revenue trend: `sparkline: [@revenue] color="#22c55e" line-width=2 width=200`

## 5. Comparison with Literal

Literal data: `sparkline: [10, 25, 15, 30, 20, 35, 25] color="red"`

Same data from frontmatter: `sparkline: [@stats] color="blue"`

## 6. Multiple References

Steps `sparkline: [@weekly_steps] color="green"` vs Revenue `sparkline: [@revenue] color="purple"`

## 7. Non-existent Key (should not render)

Missing: `sparkline: [@nonexistent] color="red"`

---

## Recommended Frontmatter Format

Use plain text with comma-separated numbers:

```yaml
---
stats: 10, 25, 15, 30, 20
---
```

This format:
- Shows correctly in Obsidian's Properties editor
- No orange warnings or question marks
- Easy to edit
- Fully supported by the sparkline plugin

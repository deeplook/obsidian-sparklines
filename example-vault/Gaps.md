# Gap Examples

This note demonstrates sparklines with gaps (null values) in various configurations.

## Empty and Single Value

`sparkline: [] line-width="3"` - `[]` 

`sparkline: [null] line-width="3"` - `[null]`

`sparkline: [1] line-width="3"` - `[1]`

## Leading/Trailing Gaps

`sparkline: [null 1] line-width="3"` - `[null 1]`

`sparkline: [1 null] line-width="3"` - `[1 null]`

`sparkline: [null 1 null] line-width="3"` - `[null 1 null]`

## Simple Gap

`sparkline: [1 null 2] line-width="3"` - `[1 null 2]`

## Mixed Segments and Isolated Points

`sparkline: [1 2 null 1] line-width="3"` - `[1 2 null 1]` 

`sparkline: [1 null 2 1] line-width="3"` - `[1 null 2 1]` 

`sparkline: [1 2 null 2 1] line-width="3"` - `[1 2 null 2 1]`

`sparkline: [null 1 2 1 null] line-width="3"` - `[null 1 2 1 null]`

## Multiple Gaps

`sparkline: [1 null 2 null 3] line-width="3"` - `[1 null 2 null 3]`

## Supported Null Markers

The following are all recognized as gap markers (case insensitive):
- `null`
- `none`
- `nil`
- `undefined`
- `na`
- `n/a`

Example: `sparkline: [1 null 2 none 3 nil 4] line-width="3"` - Multiple gap types

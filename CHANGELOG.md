# Changelog

All notable changes to the Sparkline Inline plugin will be documented in this file.

## [1.0.0] - 2025-01-21

### Added
- Initial release
- Inline sparkline rendering in Live Preview and Reading mode
- Literal data syntax: `sparkline: [1 2 3 4 5]`
- Dynamic data from frontmatter: `sparkline: [@stats]`
- Customizable options: `color`, `width`, `line-width`, `view-height`, `padding`
- Default color uses Obsidian's accent color (`--interactive-accent`)
- Support for multiple markdown contexts (headings, lists, tables, callouts, etc.)
- Cursor-aware editing (shows source when cursor is inside sparkline block)

### Security
- Uses DOM API instead of innerHTML for SVG creation

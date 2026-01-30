import { App, Plugin, MarkdownPostProcessorContext, Notice, TFile } from "obsidian";
import { SparklineOptions } from "./sparkline";
import {
  ViewPlugin,
  ViewUpdate,
  EditorView,
  Decoration,
  DecorationSet,
  WidgetType,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Cache for bases data to enable synchronous access
 */
const basesDataCache: Map<string, Array<number | null> | null> = new Map();
const basesPendingLoads: Set<string> = new Set();

/**
 * Data source types for sparkline data
 */
type DataSource =
  | { type: "literal"; numbers: Array<number | null> }
  | { type: "reference"; source: string; key: string }
  | { type: "bases"; baseName: string; column: string };

/**
 * Parsed .base file structure
 */
interface BaseDefinition {
  properties: Record<string, { type: string }>;
  filter: string;
  columns: Array<{ property: string; label: string }>;
  sort: Array<{ property: string; order: "asc" | "desc" }>;
  viewsSort: Array<{ property: string; order: "asc" | "desc" }>;
}

/**
 * Parsed sparkline block result
 */
interface ParsedSparkline {
  data: DataSource;
  options: SparklineOptions;
}

/**
 * Create an SVG sparkline element using DOM API (no innerHTML)
 * Supports null values for gaps in the line
 */
function createSparklineSvgElement(
  numbers: Array<number | null>,
  options: SparklineOptions = {}
): SVGSVGElement {
  const {
    width = 100,
    color = "currentColor",
    lineWidth = 1.0,
    viewHeight = 20,
    padding = 2.0,
    lineCap = "round",
    lineJoin = "round",
    dashArray,
  } = options;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${viewHeight}`);
  svg.setAttribute("width", String(width));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Filter out nulls for min/max calculation and check if we have any valid data
  const validNumbers = numbers.filter((n): n is number => n !== null);

  if (validNumbers.length === 0) {
    return svg;
  }

  const minVal = Math.min(...validNumbers);
  const maxVal = Math.max(...validNumbers);
  const valueRange = maxVal - minVal;
  const plotHeight = viewHeight - 2 * padding;

  // Calculate coordinates for all positions (including nulls)
  // For single value, place it in the middle
  const xCoords = numbers.map((_, i) =>
    numbers.length === 1 ? width / 2 : (i * width) / (numbers.length - 1)
  );

  // Helper to scale a value to y-coordinate
  const scaleY = (val: number): number => {
    if (valueRange === 0) {
      return viewHeight / 2;
    }
    return viewHeight - (((val - minVal) / valueRange) * plotHeight + padding);
  };

  // Build path data with M commands for each segment
  const commands: string[] = [];
  let inSegment = false;

  for (let i = 0; i < numbers.length; i++) {
    const val = numbers[i];
    if (val === null) {
      inSegment = false;
      continue;
    }

    const x = xCoords[i];
    const y = scaleY(val);

    if (!inSegment) {
      // Start a new segment with M command
      commands.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
      inSegment = true;
    } else {
      // Continue segment with L command
      commands.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
  }

  // Track which points are part of line segments vs isolated
  const pointInLine = new Set<number>();
  let lastMIndex = -1;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    if (cmd.startsWith('M')) {
      lastMIndex = i;
    } else if (cmd.startsWith('L') && lastMIndex >= 0) {
      // This L command connects the point at lastMIndex to this point
      pointInLine.add(lastMIndex);
      pointInLine.add(i);
      lastMIndex = i;
    }
  }

  // If we only have single points (no lines), render them as small circles
  const hasLines = commands.some(cmd => cmd.startsWith('L'));

  if (commands.length === 0) {
    return svg;
  }

  const pathData = commands.join(" ");

  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathData);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", String(lineWidth));
  path.setAttribute("stroke-linecap", lineCap);
  path.setAttribute("stroke-linejoin", lineJoin);
  if (dashArray) {
    path.setAttribute("stroke-dasharray", dashArray);
  }

  svg.appendChild(path);

  // Add circles for isolated points (not part of any line segment)
  // or for all points if there are no lines at all
  const radius = Math.max(1.5, lineWidth);
  let cmdIndex = 0;
  for (let i = 0; i < numbers.length; i++) {
    const val = numbers[i];
    if (val === null) continue;

    // Check if this point is isolated (not part of a line segment)
    const isIsolated = !hasLines || !pointInLine.has(cmdIndex);

    if (isIsolated) {
      let x = xCoords[i];
      let y = scaleY(val);

      // Clamp coordinates to keep circles fully visible within viewBox
      // Add small margin to prevent touching the very edge
      const margin = 0.5;
      x = Math.max(radius + margin, Math.min(width - radius - margin, x));
      y = Math.max(radius + margin, Math.min(viewHeight - radius - margin, y));

      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", x.toFixed(1));
      circle.setAttribute("cy", y.toFixed(1));
      circle.setAttribute("r", String(radius));
      circle.setAttribute("fill", color);
      svg.appendChild(circle);
    }

    cmdIndex++;
  }

  return svg;
}

/**
 * Parse options from the options string
 */
function parseOptions(optionsContent: string): SparklineOptions {
  const options: SparklineOptions = {};
  const optionRegex =
    /([a-z-]+)\s*=\s*"([^"]*)"|([a-z-]+)\s*=\s*'([^']*)'|([a-z-]+)\s*=\s*(\S+)/gi;

  let optMatch;
  while ((optMatch = optionRegex.exec(optionsContent)) !== null) {
    if (optMatch[1] && optMatch[2] !== undefined) {
      setOption(options, optMatch[1], optMatch[2]);
    } else if (optMatch[3] && optMatch[4] !== undefined) {
      setOption(options, optMatch[3], optMatch[4]);
    } else if (optMatch[5] && optMatch[6] !== undefined) {
      setOption(options, optMatch[5], optMatch[6]);
    }
  }

  return options;
}

/**
 * Parse numbers from a string (space or comma separated)
 * Supports null/none/nil/undefined as gap markers
 */
function parseNumbers(content: string): Array<number | null> {
  const numbers: Array<number | null> = [];
  // Split by comma or whitespace, but keep delimiters to detect null markers
  const tokens = content.split(/([,\s]+)/);

  for (const token of tokens) {
    const trimmed = token.trim();
    if (trimmed === '' || trimmed === ',') continue;

    // Check for null markers (case insensitive)
    if (/^(null|none|nil|undefined|na|n\/a)$/i.test(trimmed)) {
      numbers.push(null);
    } else {
      // Try to parse as number
      const num = parseFloat(trimmed);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }
  }

  return numbers;
}

/**
 * Parse sparkline syntax from inline code block.
 * Syntax:
 *   Literal: sparkline: [1 2 3 4 5] color="red"
 *   Reference: sparkline: [@stats] color="red"
 *   Explicit: sparkline: [@frontmatter:stats] color="red"
 *
 * @param text - The text content of the inline code block
 * @returns Parsed sparkline data or null if not a valid sparkline block
 */
function parseSparklineBlock(text: string): ParsedSparkline | null {
  // Match sparkline: [data] options pattern - data can be empty
  const match = text.match(/^sparkline:\s*\[([^\]]*)\]\s*(.*)$/i);
  if (!match) {
    return null;
  }

  const dataContent = match[1].trim();
  const optionsContent = match[2].trim();

  // Check if it's a bases reference: [@bases:BaseName:column]
  // Use [^:]+ for base name to avoid greedy matching issues with dots/underscores
  // Allow dots, hyphens, underscores in column names for properties like file.name, mood-score
  const basesMatch = dataContent.match(/^@bases:([^:]+):([a-z_][a-z0-9_.-]*)$/i);
  if (basesMatch) {
    const baseName = basesMatch[1].trim();
    const column = basesMatch[2];
    return {
      data: { type: "bases", baseName, column },
      options: parseOptions(optionsContent),
    };
  }

  // Check if it's a reference: [@key] or [@source:key]
  const refMatch = dataContent.match(/^@(?:([a-z]+):)?([a-z_][a-z0-9_]*)$/i);
  if (refMatch) {
    const source = refMatch[1]?.toLowerCase() || "frontmatter";
    const key = refMatch[2];
    return {
      data: { type: "reference", source, key },
      options: parseOptions(optionsContent),
    };
  }

  // Otherwise parse as literal numbers
  const numbers = parseNumbers(dataContent);
  // Allow empty arrays to be parsed (will render as empty SVG)

  return {
    data: { type: "literal", numbers },
    options: parseOptions(optionsContent),
  };
}

/**
 * Parse a simple YAML-like .base file
 * Note: This is a simplified parser for Obsidian Bases format
 */
function parseBaseFile(content: string): BaseDefinition | null {
  try {
    // Simple YAML parsing for base files
    const lines = content.split("\n");
    const result: BaseDefinition = {
      properties: {},
      filter: "",
      columns: [],
      sort: [],
      viewsSort: [],
    };

    let currentSection = "";
    let currentItem: Record<string, string> = {};
    let inMultilineFilter = false;
    let filterLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Handle multiline filter
      if (inMultilineFilter) {
        if (line.startsWith("  ") || line.startsWith("\t") || trimmed === "") {
          filterLines.push(trimmed);
          continue;
        } else {
          inMultilineFilter = false;
          result.filter = filterLines.join(" ").trim();
        }
      }

      // Skip empty lines
      if (trimmed === "") continue;

      // Check for top-level sections
      if (trimmed === "properties:" || trimmed === "columns:" || trimmed === "sort:" || trimmed === "views:") {
        // Push pending item before switching sections
        if (currentSection === "columns" && currentItem.property) {
          result.columns.push({
            property: currentItem.property,
            label: currentItem.label || currentItem.property,
          });
        }
        if (currentSection === "sort" && currentItem.property) {
          result.sort.push({
            property: currentItem.property,
            order: (currentItem.order as "asc" | "desc") || "asc",
          });
        }
        currentItem = {};

        if (trimmed === "properties:") {
          currentSection = "properties";
        } else if (trimmed === "columns:") {
          currentSection = "columns";
        } else if (trimmed === "sort:") {
          currentSection = "sort";
        } else if (trimmed === "views:") {
          currentSection = "views";
        }
        continue;
      } else if (trimmed.startsWith("filter:")) {
        const filterValue = trimmed.substring(7).trim();
        if (filterValue === "|") {
          inMultilineFilter = true;
          filterLines = [];
        } else {
          result.filter = filterValue;
        }
        continue;
      }

      // Parse section content
      if (currentSection === "properties") {
        // Property name (e.g., "  date:")
        const propMatch = line.match(/^\s{2}(\w+):$/);
        if (propMatch) {
          currentItem = { name: propMatch[1] };
        }
        // Property type (e.g., "    type: date")
        const typeMatch = line.match(/^\s{4}type:\s*(.+)$/);
        if (typeMatch && currentItem.name) {
          result.properties[currentItem.name] = { type: typeMatch[1].trim() };
        }
      } else if (currentSection === "columns") {
        // Array item start
        if (trimmed.startsWith("- ")) {
          if (currentItem.property) {
            result.columns.push({
              property: currentItem.property,
              label: currentItem.label || currentItem.property,
            });
          }
          currentItem = {};
          const afterDash = trimmed.substring(2);
          const propMatch = afterDash.match(/^property:\s*(.+)$/);
          if (propMatch) {
            currentItem.property = propMatch[1].trim();
          }
        } else {
          const propMatch = trimmed.match(/^property:\s*(.+)$/);
          const labelMatch = trimmed.match(/^label:\s*(.+)$/);
          if (propMatch) currentItem.property = propMatch[1].trim();
          if (labelMatch) currentItem.label = labelMatch[1].trim();
        }
      } else if (currentSection === "sort") {
        if (trimmed.startsWith("- ")) {
          if (currentItem.property) {
            result.sort.push({
              property: currentItem.property,
              order: (currentItem.order as "asc" | "desc") || "asc",
            });
          }
          currentItem = {};
          const afterDash = trimmed.substring(2);
          const propMatch = afterDash.match(/^property:\s*(.+)$/);
          if (propMatch) {
            currentItem.property = propMatch[1].trim();
          }
        } else {
          const propMatch = trimmed.match(/^property:\s*(.+)$/);
          const orderMatch = trimmed.match(/^order:\s*(.+)$/);
          if (propMatch) currentItem.property = propMatch[1].trim();
          if (orderMatch) currentItem.order = orderMatch[1].trim();
        }
      }
    }

    // Handle last items in arrays
    if (currentSection === "columns" && currentItem.property) {
      result.columns.push({
        property: currentItem.property,
        label: currentItem.label || currentItem.property,
      });
    }
    if (currentSection === "sort" && currentItem.property) {
      result.sort.push({
        property: currentItem.property,
        order: (currentItem.order as "asc" | "desc") || "asc",
      });
    }
    if (inMultilineFilter) {
      result.filter = filterLines.join(" ").trim();
    }

    // Parse views section for sort - look for sort entries in the first view
    // Format: "sort:\n      - property: file.name\n        direction: ASC"
    const viewsMatch = content.match(/views:\s*\n([\s\S]*?)(?=\n[a-z]|\n*$)/i);
    if (viewsMatch) {
      const viewsBlock = viewsMatch[1];
      // Find sort section within views
      const sortMatch = viewsBlock.match(/sort:\s*\n((?:\s+-[^\n]*\n(?:\s+\w+:[^\n]*\n)*)*)/);
      if (sortMatch) {
        const sortBlock = sortMatch[1];
        // Match property/direction pairs
        const entries = sortBlock.matchAll(/-\s*property:\s*([^\n]+)\n\s*direction:\s*(ASC|DESC)/gi);
        for (const entry of entries) {
          result.viewsSort.push({
            property: entry[1].trim(),
            order: entry[2].toLowerCase() as "asc" | "desc",
          });
        }
      }
    }

    return result;
  } catch (e) {
    console.error("Sparkline: Failed to parse base file", e);
    return null;
  }
}

/**
 * Evaluate a simple filter expression against file metadata
 * Supports: file.folder, file.name with = and != operators, connected by "and"
 */
function evaluateFilter(
  filter: string,
  filePath: string,
  fileName: string
): boolean {
  if (!filter.trim()) return true;

  // Split by "and" (case insensitive)
  const conditions = filter.split(/\s+and\s+/i);

  for (const condition of conditions) {
    const trimmed = condition.trim();

    // Match patterns like: file.folder = "value" or file.name != "value"
    const match = trimmed.match(
      /^(file\.folder|file\.name)\s*(=|!=)\s*"([^"]*)"$/
    );
    if (!match) continue;

    const [, field, operator, value] = match;
    let actual = "";

    if (field === "file.folder") {
      // Get folder path (everything before the last /)
      const lastSlash = filePath.lastIndexOf("/");
      actual = lastSlash >= 0 ? filePath.substring(0, lastSlash) : "";
    } else if (field === "file.name") {
      // File name without extension
      actual = fileName.replace(/\.[^.]+$/, "");
    }

    const matches = actual === value;
    if (operator === "=" && !matches) return false;
    if (operator === "!=" && matches) return false;
  }

  return true;
}

/**
 * Resolve a bases reference to actual numbers
 */
async function resolveBasesReference(
  baseName: string,
  column: string,
  app: App
): Promise<Array<number | null> | null> {
  // Find the .base file
  const baseFileName = `${baseName}.base`;
  const allFiles = app.vault.getFiles();
  const baseFile = allFiles.find(
    (f) => f.name === baseFileName || f.path.endsWith(`/${baseFileName}`)
  );

  if (!baseFile) {
    console.warn(`Sparkline: Base file "${baseFileName}" not found`);
    return null;
  }

  // Read and parse the base file
  const content = await app.vault.read(baseFile);
  const baseDef = parseBaseFile(content);
  if (!baseDef) {
    console.warn(`Sparkline: Failed to parse base file "${baseFileName}"`);
    return null;
  }

  // Determine effective sort - prioritize views sort, then top-level sort
  const effectiveSort = baseDef.viewsSort.length > 0 ? baseDef.viewsSort : baseDef.sort;
  // Find files matching the filter
  const matchingData: Array<{ sortValues: unknown[]; value: number; fileName: string }> = [];

  for (const file of allFiles) {
    if (file.extension !== "md") continue;

    const fileName = file.name.replace(/\.md$/, "");

    if (!evaluateFilter(baseDef.filter, file.path, file.name)) {
      continue;
    }

    // Get frontmatter data
    const cache = app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter;
    if (!frontmatter) continue;

    // Extract the column value
    const colValue = frontmatter[column];
    if (colValue === undefined || colValue === null) continue;

    const numValue =
      typeof colValue === "number" ? colValue : parseFloat(colValue);
    if (isNaN(numValue)) continue;

    // Get sort values for all sort fields
    const sortValues: unknown[] = [];
    if (effectiveSort.length > 0) {
      for (const sortDef of effectiveSort) {
        const sortProp = sortDef.property;
        if (sortProp === "file.name" || sortProp === "file.basename") {
          sortValues.push(fileName);
        } else {
          sortValues.push(frontmatter[sortProp] ?? "");
        }
      }
    } else {
      // Default sort by file name
      sortValues.push(fileName);
    }

    matchingData.push({ sortValues, value: numValue, fileName });
  }

  if (matchingData.length === 0) {
    console.warn(`Sparkline: No matching data found for base "${baseName}"`);
    return null;
  }

  // Sort the data using all sort fields
  matchingData.sort((a, b) => {
    // Compare each sort field in order
    for (let i = 0; i < a.sortValues.length; i++) {
      const aVal = a.sortValues[i];
      const bVal = b.sortValues[i];
      const order = effectiveSort[i]?.order ?? "asc";

      let cmp: number;
      if (typeof aVal === "string" && typeof bVal === "string") {
        cmp = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal));
      }

      if (cmp !== 0) {
        return order === "desc" ? -cmp : cmp;
      }
    }
    // Final fallback: sort by file name for stability
    return a.fileName.localeCompare(b.fileName);
  });

  return matchingData.map((d) => d.value);
}

/**
 * Get cache key for bases reference
 */
function getBasesCacheKey(baseName: string, column: string): string {
  return `bases:${baseName}:${column}`;
}

/**
 * Trigger async loading of bases data and update cache
 * Returns a promise that resolves when loading is complete
 */
async function loadBasesData(
  baseName: string,
  column: string,
  app: App,
  onComplete?: () => void
): Promise<void> {
  const cacheKey = getBasesCacheKey(baseName, column);

  // Skip if already loading
  if (basesPendingLoads.has(cacheKey)) return;

  basesPendingLoads.add(cacheKey);

  try {
    const data = await resolveBasesReference(baseName, column, app);
    basesDataCache.set(cacheKey, data);
    onComplete?.();
  } finally {
    basesPendingLoads.delete(cacheKey);
  }
}

/**
 * Resolve data reference to actual numbers (synchronous)
 * For bases references, returns cached data or null if not yet loaded
 */
function resolveDataReference(
  data: DataSource,
  app: App,
  filePath: string,
  onBasesLoad?: () => void
): Array<number | null> | null {
  if (data.type === "literal") {
    return data.numbers;
  }

  // Bases type - use cache
  if (data.type === "bases") {
    const cacheKey = getBasesCacheKey(data.baseName, data.column);

    // Return cached data if available
    if (basesDataCache.has(cacheKey)) {
      return basesDataCache.get(cacheKey) ?? null;
    }

    // Trigger async load
    void loadBasesData(data.baseName, data.column, app, onBasesLoad);
    return null;
  }

  // Reference type (frontmatter)
  if (data.type === "reference" && data.source === "frontmatter") {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return null;

    const cache = app.metadataCache.getFileCache(file);
    const value = cache?.frontmatter?.[data.key];

    // Handle array values - preserve nulls for gaps
    if (Array.isArray(value)) {
      const numbers: Array<number | null> = value
        .map((v) => {
          if (v === null || v === undefined) return null;
          if (typeof v === "number") return v;
          if (typeof v === "string") {
            // Check for null markers
            if (/^(null|none|nil|undefined|na|n\/a)$/i.test(v.trim())) {
              return null;
            }
            const parsed = parseFloat(v);
            return isNaN(parsed) ? null : parsed;
          }
          return null;
        });
      return numbers.length > 0 ? numbers : null;
    }

    // Handle comma/space separated string
    if (typeof value === "string") {
      const numbers = parseNumbers(value);
      return numbers.length > 0 ? numbers : null;
    }

    return null;
  }

  // Unknown source
  if (data.type === "reference") {
    console.warn(`Sparkline: Unknown data source "${data.source}"`);
  }
  return null;
}

/**
 * Set option value, handling type conversion
 */
function setOption(
  options: SparklineOptions,
  key: string,
  value: string
): void {
  const normalizedKey = key.toLowerCase();

  switch (normalizedKey) {
    case "color":
      options.color = value;
      break;
    case "width":
      options.width = parseInt(value, 10);
      break;
    case "line-width":
    case "linewidth":
      options.lineWidth = parseFloat(value);
      break;
    case "view-height":
    case "viewheight":
      options.viewHeight = parseInt(value, 10);
      break;
    case "padding":
      options.padding = parseFloat(value);
      break;
    case "cap":
    case "linecap":
    case "line-cap":
    case "stroke-linecap":
      options.lineCap = value as "butt" | "round" | "square";
      break;
    case "join":
    case "linejoin":
    case "line-join":
    case "stroke-linejoin":
      options.lineJoin = value as "miter" | "round" | "bevel";
      break;
    case "dash":
    case "dasharray":
    case "dash-array":
    case "stroke-dasharray":
      options.dashArray = value;
      break;
  }
}

/**
 * Widget to render sparkline SVG in Live Preview mode
 */
class SparklineWidget extends WidgetType {
  constructor(
    private numbers: Array<number | null>,
    private options: SparklineOptions,
    private useAccentColor: boolean
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = this.useAccentColor ? "sparkline sparkline--accent" : "sparkline";
    const svg = createSparklineSvgElement(this.numbers, this.options);
    span.appendChild(svg);
    return span;
  }
}

/**
 * Check if cursor is within or adjacent to a range
 */
function isCursorInRange(view: EditorView, from: number, to: number): boolean {
  const selection = view.state.selection;
  for (const range of selection.ranges) {
    if (range.from <= to + 1 && range.to >= from - 1) {
      return true;
    }
  }
  return false;
}

/**
 * Build decorations for sparkline code blocks in the editor
 */
function buildDecorations(
  view: EditorView,
  app: App,
  onBasesLoad?: () => void
): DecorationSet {
  const decorations: Array<{
    from: number;
    to: number;
    decoration: Decoration;
  }> = [];

  // Get current file path
  const activeFile = app.workspace.getActiveFile();
  const filePath = activeFile?.path || "";

  syntaxTree(view.state).iterate({
    enter(node: { name: string; from: number; to: number }) {
      const nodeName = node.name.toLowerCase();
      if (
        nodeName.includes("code") &&
        !nodeName.includes("codeblock") &&
        !nodeName.includes("fencedcode")
      ) {
        const from = node.from;
        const to = node.to;

        if (isCursorInRange(view, from, to)) {
          return;
        }

        const text = view.state.doc.sliceString(from, to);
        const codeContent = text.replace(/^`+|`+$/g, "");
        const parsed = parseSparklineBlock(codeContent);

        if (parsed) {
          const numbers = resolveDataReference(
            parsed.data,
            app,
            filePath,
            onBasesLoad
          );
          // Render if we have numbers (even if all null - will show empty SVG)
          if (numbers !== null) {
            const useAccentColor = !parsed.options.color;
            decorations.push({
              from,
              to,
              decoration: Decoration.replace({
                widget: new SparklineWidget(
                  numbers,
                  parsed.options,
                  useAccentColor
                ),
              }),
            });
          }
        }
      }
    },
  });

  return Decoration.set(
    decorations.map((d) => d.decoration.range(d.from, d.to)),
    true
  );
}

/**
 * Create CodeMirror ViewPlugin for Live Preview mode
 */
function createSparklineViewPlugin(app: App) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private view: EditorView;
      private pendingUpdate = false;

      constructor(view: EditorView) {
        this.view = view;
        this.decorations = buildDecorations(view, app, () =>
          this.scheduleUpdate()
        );
      }

      scheduleUpdate() {
        if (this.pendingUpdate) return;
        this.pendingUpdate = true;
        // Schedule update on next frame to batch multiple loads
        requestAnimationFrame(() => {
          this.pendingUpdate = false;
          this.decorations = buildDecorations(this.view, app, () =>
            this.scheduleUpdate()
          );
          // Force editor to re-render decorations
          this.view.dispatch({ effects: [] });
        });
      }

      update(update: ViewUpdate) {
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet
        ) {
          this.view = update.view;
          this.decorations = buildDecorations(update.view, app, () =>
            this.scheduleUpdate()
          );
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}

/**
 * Clear all bases cache entries
 */
function clearBasesCache(): void {
  basesDataCache.clear();
}

export default class SparklinePlugin extends Plugin {
  onload(): void {

    // Register markdown post processor for Reading mode
    this.registerMarkdownPostProcessor(
      (element: HTMLElement, context: MarkdownPostProcessorContext) => {
        this.processSparklines(element, context.sourcePath);
      }
    );

    // Register editor extension for Live Preview mode
    this.registerEditorExtension(createSparklineViewPlugin(this.app));

    // Clear bases cache when files are modified or created
    this.registerEvent(
      this.app.vault.on("modify", () => clearBasesCache())
    );
    this.registerEvent(
      this.app.vault.on("create", () => clearBasesCache())
    );
    this.registerEvent(
      this.app.vault.on("delete", () => clearBasesCache())
    );

    // Show a notice to confirm plugin is loaded (can be removed later)
    new Notice("Sparkline plugin loaded");
  }

  /**
   * Process all inline code elements in the given element (Reading mode)
   */
  processSparklines(element: HTMLElement, sourcePath: string): void {
    const codeElements = element.querySelectorAll("code:not(pre code)");

    codeElements.forEach((codeEl) => {
      const text = codeEl.textContent;
      if (!text) return;

      const parsed = parseSparklineBlock(text);
      if (!parsed) return;

      // Create placeholder span that will be updated when data loads
      const span = document.createElement("span");
      const useAccentColor = !parsed.options.color;
      span.className = useAccentColor ? "sparkline sparkline--accent" : "sparkline";

      // Callback to render sparkline when data is available
      const renderSparkline = () => {
        const numbers = resolveDataReference(parsed.data, this.app, sourcePath);
        if (numbers === null) return;

        // Clear and re-render
        span.innerHTML = "";
        const svg = createSparklineSvgElement(numbers, parsed.options);
        span.appendChild(svg);
      };

      // Try to render immediately (works for literal and frontmatter data)
      const numbers = resolveDataReference(
        parsed.data,
        this.app,
        sourcePath,
        renderSparkline
      );

      if (numbers !== null) {
        const svg = createSparklineSvgElement(numbers, parsed.options);
        span.appendChild(svg);
      }

      codeEl.replaceWith(span);
    });
  }

  onunload(): void {
    // Plugin cleanup if needed
  }
}
